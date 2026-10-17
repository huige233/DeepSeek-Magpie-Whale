"""Deterministic original earcons, no samples, voices, or third-party recordings."""
import math, random, struct, wave, json, hashlib
from pathlib import Path

RATE=24000
OUT=Path(__file__).resolve().parents[1]/'frontend/assets/characters/audio'
THEMES={
    'claude': (60,'wood',[0,4,7]),
    'glm': (76,'bell',[0,7,12]),
    'gpt': (65,'harp',[0,5,9,12]),
    'grok': (57,'synth',[0,3,10,7]),
    'qwen': (62,'pluck',[0,2,7]),
    'gemini': (79,'star',[0,7,4,12]),
    'kimi': (72,'flute',[0,2,5]),
}
def tone(t,f,kind,duration):
    attack=min(1,t/.012);tail=min(1,max(0,(duration-t)/.045))
    decay=math.exp(-t*(7 if kind in ('wood','pluck') else 4))
    x=2*math.pi*f*t
    if kind=='wood': v=math.sin(x)+.30*math.sin(2.76*x)*math.exp(-t*16)
    elif kind=='bell': v=math.sin(x)+.25*math.sin(2.4*x)+.09*math.sin(4.8*x)
    elif kind=='harp': v=math.sin(x)+.3*math.sin(2*x)+.13*math.sin(3*x)
    elif kind=='synth': v=math.sin(x+1.3*math.sin(x*.5)*math.exp(-t*6))+.12*math.sin(3*x)
    elif kind=='pluck': v=math.sin(x)+.42*math.sin(2*x)*math.exp(-t*12)+.25*math.sin(4*x)*math.exp(-t*20)
    elif kind=='star': v=math.sin(x)+.23*math.sin(x*3)+.12*math.sin(x*5.02)
    else: v=(math.sin(x+.018*math.sin(2*math.pi*5*t))+.11*math.sin(2*x))*(1-math.exp(-t*35))
    return v*attack*tail*decay

OUT.mkdir(parents=True,exist_ok=True)
report=[]
for i,(name,(base,kind,motif)) in enumerate(THEMES.items()):
    for cue in ('pat','angry','feed'):
        notes=motif if cue=='pat' else [motif[-1]-7,2,-2] if cue=='angry' else [0,0,motif[1],motif[-1]]
        spacing=.13 if cue=='pat' else .11 if cue=='angry' else .17
        length=.94 if cue!='feed' else 1.12
        samples=[0.0]*int(RATE*length)
        rng=random.Random(600+i)
        for j,note in enumerate(notes):
            onset=.025+j*spacing;duration=.37 if kind!='flute' else .44
            freq=440*2**((base+note-69)/12)
            for k in range(int(duration*RATE)):
                idx=int(onset*RATE)+k
                if idx>=len(samples):break
                samples[idx]+=.25*tone(k/RATE,freq,kind,duration)
        if cue=='feed':
            # Quiet, short grain-like crunches underneath the character's motif.
            for onset in (.055,.225,.395):
                for k in range(int(.07*RATE)):
                    t=k/RATE;samples[int(onset*RATE)+k]+=.055*rng.uniform(-1,1)*math.sin(math.pi*t/.07)**2*math.exp(-t*25)
        peak=max(abs(x) for x in samples);gain=.48/peak
        pcm=b''.join(struct.pack('<h',round(x*gain*32767)) for x in samples)
        path=OUT/f'{name}_{cue}.wav'
        with wave.open(str(path),'wb') as w:w.setparams((1,2,RATE,0,'NONE','not compressed'));w.writeframes(pcm)
        report.append({'file':path.name,'seconds':length,'peak':.48,'rms':(sum((x*gain)**2 for x in samples)/len(samples))**.5,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(OUT/'manifest.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
(OUT/'SOURCE.txt').write_text('Original synthetic character interaction earcons, generated with tools/generate_character_sounds.py.\nNo sampled recordings, cloned voices, game audio, or third-party music.\nLicensed under the project code license. These are sound effects, not character voice acting.\n',encoding='ascii')
assert len({r['sha256'] for r in report})==21
print('Generated 21 distinct mono PCM WAV earcons; 24 kHz, peak <= 0.48.')
