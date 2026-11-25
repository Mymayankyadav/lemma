"""Create private lab parity targets from the exact trained native model and its frozen inputs."""
import argparse
import json
from pathlib import Path
import torch

from corpus import file_hash
from neural import Decoder, Config


def build(checkpoint,cases,destination):
    if file_hash(checkpoint) != 'b5ff62b315695b32b2f85e51f9ddffc2abdd64f25c17d68bd35a2d0712983687' or file_hash(cases) != '1a2f47cd12d8c2b9947470920cbc96bfffefb9c618e68f13b803dd48aacec29c':
        raise ValueError('Checkpoint or parity inputs differ from the approved artifacts')
    params=torch.load(checkpoint,map_location='cpu',weights_only=False)
    model=Decoder(Config(**params['settings']['config'])).eval()
    model.load_state_dict(params['model'])
    torch.set_num_threads(2)
    rows=[]
    with torch.inference_mode():
        for case in json.loads(cases.read_bytes()):
            ids=case['ids']
            logits=model.next(torch.tensor([ids],dtype=torch.long))[0][0]
            rows.append(dict(ids=ids,top=logits.topk(3).indices.tolist(),group='partial' if 'previousIds' in case else
                             'whole' if 'candidateTokens' in case else case['layout'],stablePrefix=case.get('stablePrefix'), previousIds=case.get('previousIds')))
    destination.write_text(json.dumps(rows,separators=(',',':'))+'\n')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for arg in ('checkpoint','cases','out'):
        parser.add_argument('--'+arg, required=True,type=Path)
    args=parser.parse_args()
    build(args.checkpoint,args.cases,args.out)
