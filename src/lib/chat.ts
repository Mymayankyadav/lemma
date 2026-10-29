export const resumePrompt = (project: string) => `Resume ${project}`;
export const studyPrompt = (project: string, code?: string, title?: string) =>
  `Study ${project}${code ? `, ${code}${title ? ` ${title}` : ""}` : ""}`;
export const planPrompt = (project: string) => `Plan ${project}`;
export const revisePlanPrompt = (project: string, text: string) =>
  `Revise the plan for ${project}: ${text}`;
export const updateCardsPrompt = () => "Update my cards";
export function chatLink(client: "claude" | "chatgpt", prompt: string): string {
  return `${client === "claude" ? "https://claude.ai/new?q=" : "https://chatgpt.com/?q="}${encodeURIComponent(prompt)}`;
}
