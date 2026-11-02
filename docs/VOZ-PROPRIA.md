# Voz própria do assistente (Google Colab + XTTS v2)

O app fala com a voz do navegador ou com a **sua própria voz**. A sua voz é gerada por um servidor que roda no seu Google Colab (grátis, com GPU) a partir de uma gravação sua. O app manda o texto e o Colab devolve o áudio.

```
App (celular/PC) ──texto──► túnel ngrok ──► Colab (XTTS v2 + voz_mavis.wav)
                 ◄──áudio WAV──────────────┘
```

Limites que vale saber antes:
- **Só funciona enquanto a célula do Colab estiver rodando.** O Colab gratuito desliga depois de um tempo sem uso (cerca de 90 minutos) e tem limite diário de GPU. Desligado, o app usa a voz do navegador sozinho.
- As **saudações** ficam guardadas no aparelho depois da primeira vez, então tocam com a sua voz mesmo com o Colab desligado.
- Use **só a sua voz** (ou a de alguém que autorizou). Não use gravações de outras pessoas, personagens ou artistas.
- O XTTS v2 tem a licença Coqui Public Model License: uso pessoal e **não comercial**.
- O texto falado (diagnóstico e saudação com o seu primeiro nome) passa pelo ngrok e pelo Colab.

## 1. Grave a referência

1. Grave de **20 a 40 segundos** lendo um texto formal, com voz clara, em um lugar silencioso. Pode ser algo como:
   > "Boa noite. Os números deste mês já foram analisados. As despesas fixas estão sob controle, mas os gastos com lazer cresceram acima da média. Recomendo revisar as assinaturas e definir um limite semanal. Com disciplina, a meta de reserva será atingida antes do previsto."
2. Salve como **`voz_mavis.wav`**. Se o gravador do celular salvar em .m4a ou .mp3, converta para WAV (por exemplo, no Audacity: Arquivo → Exportar → WAV).

## 2. Prepare o ngrok

1. Crie uma conta grátis em [ngrok.com](https://ngrok.com/) e copie o **Authtoken** (Your Authtoken).
2. Recomendado: em **Domains**, pegue o seu **domínio fixo grátis** (algo como `nome-fixo.ngrok-free.app`). Com ele, o endereço não muda a cada vez que você liga o Colab, e você cola no app uma única vez.

## 3. Rode o servidor no Colab

1. Abra [colab.research.google.com](https://colab.research.google.com/) e crie um notebook.
2. **Ambiente de execução → Alterar tipo de ambiente de execução → GPU (T4)**.
3. No ícone de pasta (à esquerda), envie o `voz_mavis.wav`.
4. Primeira célula (instalação, leva alguns minutos):

```python
!pip install -q coqui-tts fastapi uvicorn pyngrok python-multipart nest_asyncio
```

5. Segunda célula (o servidor). Preencha as três primeiras variáveis:

```python
import os, uuid, secrets, threading
os.environ["COQUI_TOS_AGREED"] = "1"  # aceita a licença CPML do XTTS (uso pessoal, não comercial)

import torch, uvicorn, nest_asyncio
from TTS.api import TTS
from fastapi import FastAPI, Form, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.background import BackgroundTask
from pyngrok import ngrok

NGROK_AUTHTOKEN = "COLE_SEU_AUTHTOKEN_AQUI"
NGROK_DOMINIO = ""   # opcional: seu domínio fixo, ex.: "nome-fixo.ngrok-free.app"
TOKEN_VOZ = ""       # opcional: uma senha qualquer; cole a mesma no app

ORIGENS_APP = ["https://jhonyninho.github.io", "http://localhost:5173"]
AUDIO_REFERENCIA = "voz_mavis.wav"

device = "cuda" if torch.cuda.is_available() else "cpu"
print("Dispositivo:", device)
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
trava = threading.Lock()  # uma síntese por vez na GPU

app = FastAPI(title="Voz do assistente")
# só o seu app pode chamar este servidor pelo navegador
app.add_middleware(CORSMiddleware, allow_origins=ORIGENS_APP, allow_methods=["POST"], allow_headers=["*"])

@app.post("/sintetizar")
def sintetizar(texto: str = Form(...), x_token_voz: str = Header(default="")):
    if TOKEN_VOZ and not secrets.compare_digest(x_token_voz, TOKEN_VOZ):
        raise HTTPException(401, "token inválido")
    texto = texto.strip()[:600]
    if not texto:
        raise HTTPException(400, "texto vazio")
    if not os.path.exists(AUDIO_REFERENCIA):
        raise HTTPException(400, "voz_mavis.wav não encontrado no Colab")
    saida = f"/tmp/voz_{uuid.uuid4().hex}.wav"  # um arquivo por pedido
    with trava:
        tts.tts_to_file(text=texto, speaker_wav=AUDIO_REFERENCIA, language="pt", file_path=saida)
    return FileResponse(saida, media_type="audio/wav", background=BackgroundTask(os.remove, saida))

nest_asyncio.apply()
ngrok.set_auth_token(NGROK_AUTHTOKEN)
tunel = ngrok.connect(8000, domain=NGROK_DOMINIO) if NGROK_DOMINIO else ngrok.connect(8000)
print("=" * 60)
print("Cole este endereço no app:", tunel.public_url)
print("=" * 60)
uvicorn.run(app, host="0.0.0.0", port=8000)
```

A célula fica "rodando" o tempo todo: isso é o servidor ligado. Para desligar, pare a célula.

## 4. Ligue no app

1. **Configurações → Assistente e voz → Minha voz (servidor próprio)**.
2. Cole o endereço mostrado no Colab (`https://….ngrok-free.app`) e, se definiu, o mesmo `TOKEN_VOZ`.
3. Toque em **Testar voz**. A primeira frase pode demorar alguns segundos; as próximas são geradas enquanto a anterior toca.
4. **Timbre de IA**: "Desligado" deixa a sua voz pura; "Sutil" e "Assistente de IA" aplicam o efeito de painel.

Endereço e token ficam só no aparelho em que você salvou (cadastre no celular e no PC separadamente).

## Problemas comuns

| O app diz | O que fazer |
|---|---|
| "Não consegui falar com o seu servidor de voz" | A célula do Colab parou ou o endereço mudou. Rode a célula de novo e confira o endereço (com domínio fixo ele não muda). |
| "recusou o token" | O token no app é diferente do `TOKEN_VOZ` do script. |
| "demorou demais para responder" | O Colab está sem GPU (veja o "Dispositivo" impresso) ou sobrecarregado. Troque para GPU T4. |
| Voz robótica ou com sotaque estranho | Grave de novo a referência com mais clareza, sem ruído e com 20 a 40 segundos. |

O app só aceita endereços HTTPS de `*.ngrok-free.app`, `*.ngrok-free.dev`, `*.ngrok.app`, `*.ngrok.dev`, `*.ngrok.io` e `*.trycloudflare.com` (a política de segurança do site bloqueia qualquer outro).
