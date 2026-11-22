import {acceptEquationOutput} from './candidates';
import {algebraReadingKey} from './algebra';
import {algebraSourceConstraint, plainAlgebra} from './sourceConstraints';
import {beamSearch, encodeInput, type OrtStepper, type Vocabulary} from './upstreamDecoder.js';

export async function decodeEquation(
  stepper: OrtStepper, vocabulary: Vocabulary, text: string, shouldAbort?: () => boolean,
) {
  const input = encodeInput(text, vocabulary);
  const unknown = vocabulary.input_chars.indexOf('<unk>');
  if (!input.length || input.length > vocabulary.max_input || input.includes(unknown)) return [];
  const options = {k:3, maxLen:vocabulary.max_output, shouldAbort};
  const source = algebraSourceConstraint(text, vocabulary);
  if (!source) return beamSearch(stepper, input, vocabulary, options);

  // In typed shorthand, a run after a script marker is one attachment.
  const readingInput = plainAlgebra(text)!.replace(/([\^_])([-+]\d+|\d{2,}|[A-Za-z]{2,})/g, '$1{$2}');
  const definiteReading = !/\/|[a-z]\s*\d/i.test(text) ? algebraReadingKey(readingInput) : null;
  const validOutput = acceptEquationOutput(text);
  return beamSearch(stepper, input, vocabulary, {
    ...options,
    nReturn:definiteReading ? 1 : 3,
    maxStepsAfterFinish:6,
    source,
    finishKey:latex => {
      if (!validOutput(latex)) return null;
      const reading = algebraReadingKey(latex);
      return definiteReading && reading !== definiteReading ? null : reading;
    },
  });
}
