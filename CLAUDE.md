# AtracacaoVR

Atracação: pilotagem espacial calma e precisa em VR para o Meta Quest 3 no navegador (WebXR), sem
instalar nada. Física de Newton de verdade: nada freia sozinho, o que se move continua se movendo e
o que gira continua girando. Você está sentado na cabine de uma nave de serviço com duas alavancas:
a esquerda translada (propulsores nos 3 eixos), a direita gira (arfagem, guinada e rolagem). Os
propulsores têm empuxo fixo e gastam combustível. O desafio é a inércia e a precisão, sem tiro:
encaixar em estações (abaixo de 0,3 m/s, alinhado e com a cruz parada), pegar satélites, passar por
argolas num cinturão de asteroides, resgatar astronautas à deriva com a mão pela janela e encaixar
no eixo de estações girando. 15 fases em 3 capítulos, 1 a 3 estrelas por combustível e tempo.
Também joga no PC com teclado e mouse. Tudo em português.

## Como rodar / jogar

**No Quest:** depois de publicado, abrir no navegador do óculos
**https://parappathe.github.io/AtracacaoVR/** e apertar "Entrar em VR". Para publicar/atualizar:
commitar e rodar `python publicar.py AtracacaoVR` na pasta `C:\claude code` (só quando o Eduardo
pedir; ainda não foi publicado).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8834` (o painel de visualização
usa `.claude/launch.json`). O `serve.py` manda o navegador não guardar cache;
`python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Mover a nave (translação) | Segurar o aperto perto da alavanca esquerda e deslocar a mão: frente/trás, lados, cima/baixo (7 cm = empuxo total). Soltar volta ao centro | W/S frente e trás, A/D lados, R/F sobe e desce |
| Girar a nave | Segurar a alavanca direita: inclinar para frente/trás = arfagem (frente = nariz desce), inclinar para o lado = guinada, torcer = rolagem | Setas: arfagem (cima = nariz sobe) e guinada; Q/E: rolagem; ou botão direito do mouse arrastando |
| Sem segurar alavanca | Direcional esquerdo = translação no plano; direcional direito = guinada e arfagem | |
| Devagar (ajuste fino) | (a alavanca é proporcional) | Shift segurado: 30% do empuxo |
| Estabilizar (zera o giro, gasta mais) | A ou X | Espaço |
| Pegar astronauta | Mão perto dele, pela janela, com a velocidade igualada | Encostar o lado direito da nave nele (alcance do braço) |
| Olhar em volta | Virar a cabeça | Botão esquerdo do mouse arrastando (volta sozinho) |
| Câmera | | C: cabine ou por fora |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| Só com as mãos | Pinça perto da alavanca segura; apontar e pinça no menu | |

Na pausa do VR: "Recentralizar" põe os olhos no assento olhando para a frente da nave (funciona
sentado ou em pé); "Mais baixo / Mais alto" ajustam de 5 em 5 cm (fica salvo). Os controles vibram
com os propulsores, nas batidas e no encaixe.

### Regras

- **Encaixe:** a sonda (na frente da nave) tem que tocar a boca do encaixe com velocidade relativa
  abaixo de 0,3 m/s, eixo desviado no máximo 5°, rolagem no máximo 8°, desvio lateral no máximo
  30 cm e giro igual ao da estação (diferença até 3°/s). Rápido demais amassa (dano) e quica;
  devagar mas torto só quica.
- **Batidas:** encostar abaixo de 0,3 m/s não dá dano; acima, dano proporcional (1 m/s ≈ 30%).
  Dano 100% perde a fase. Ir para longe demais (900 m) também.
- **Combustível:** tanque de 100%. Translação 0,3%/s por eixo no máximo, rotação 0,16%/s, e
  estabilizar 0,4%/s por eixo. Sem combustível a nave segue no embalo.
- **Giro limitado:** o computador de bordo não deixa passar de 20°/s em cada eixo (conforto).
- **Estrelas:** 1 por terminar; 2 e 3 se o combustível gasto e o tempo ficarem abaixo dos dois
  limites da fase (`stars` em `js/levels.js`); dano de 50% ou mais tira uma estrela. Terminar
  libera a próxima fase. Progresso salvo no navegador (localStorage `atracacaovr.v1`).

### Fases (em `js/levels.js`)

- Órbita Baixa (Terra ao fundo): 1 Primeiro encaixe, 2 Chegada torta (já chega girando),
  3 Estação que gira (2°/s), 4 Satélite à deriva (pegar e levar ao berço), 5 Entrega em movimento
  (estação andando, satélite girando, depois encaixar).
- Cinturão (gigante gasoso com anéis): 6 Portões do cinturão (3 argolas), 7 Astronauta à deriva,
  8 Corredor de pedras (5 argolas), 9 Dois astronautas (posto à deriva), 10 Resgate no cinturão.
- Estação Giratória (planeta de gelo): 11 No eixo (4°/s), 12 Roda rápida (9°/s), 13 Roda à
  deriva, 14 Detritos (cilindro a 8°/s com detritos em órbita), 15 O cilindro (15°/s).

## Como testar

- `node tests/run.js` (ou `npm test`): quatérnios, conservação (sem propulsor a velocidade e a
  rotação não mudam, momento angular e energia conservados num rodopio), empuxo e combustível,
  torque e giro limitado, estabilizar (zera e gasta mais que zerar na mão), encaixe (certo encaixa;
  rápido, torto, cruz girada, fora do centro e sem girar junto não encaixam; o casco não bate em
  nada no encaixe de cada estação), batidas e dano (casco não entra, devagar não amassa, dano 100
  perde), astronauta (pega com velocidade igualada, escapa se rápido, mão do VR pega), satélite
  (captura, fica mais pesado), argolas, fases (15, 5 por capítulo, asteroides iguais toda vez,
  nada começa dentro da estação) e o **robô piloto**, que usa só os mesmos comandos de alavanca do
  jogador e tem que completar as 15 fases dentro do combustível com 3 estrelas (os limites de 3
  estrelas têm pelo menos 40% de folga sobre ele). Termina com "Tudo certo" e sai com erro se algo
  falhar. Não toca som (o áudio fica num arquivo que os testes nem carregam).
- No navegador (console): `dev.loadLevel(3)` abre a fase 3 (1 a 15), `dev.autoplay = true` faz o
  robô pilotar, `dev.advance(20)` avança 20 s na hora, `dev.state()` mostra tela, fase, tarefa,
  alvo, combustível e dano, `dev.snapshot()` devolve a imagem da tela (JPEG em data URL),
  `dev.camera('chase'|'cockpit')`, `dev.look(guinada, arfagem)` vira a cabeça no PC,
  `dev.resetSave()` apaga o progresso. `window.atracacao` tem `game`, `save`, `world`, `startLevel`,
  `goMenu`.
- **Só dá para testar no óculos:** pegar e mexer as alavancas de verdade (sensibilidade, zona
  morta, sentido da arfagem), pegar o astronauta com a mão, recentralizar e altura, conforto
  (giro, vinheta), vibração, pinça no rastreamento de mãos, FPS no Quest, sons.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar e avisos do PC |
| `js/math.js` | Vetores e quatérnios próprios, números aleatórios repetíveis. Sem navegador |
| `js/bodies.js` | Medidas da nave (massa, inércia, empuxo, sonda, olhos, braço, esferas de colisão), do satélite e as formas de cada estação (esfera, cápsula, caixa, cilindro) com o encaixe e o berço. Sem navegador |
| `js/sim.js` | Núcleo: `Ship` (corpo rígido 6 eixos, Euler com termo giroscópico, RCS, combustível, estabilizar, giro limitado), `Body` (estação/satélite com velocidade e giro), asteroides, detritos em órbita, `Game` (tarefas, encaixe, colisões, dano, astronautas, argolas, satélite, painel `readout()`), estrelas. Sem navegador |
| `js/levels.js` | As 15 fases e os capítulos (legenda no topo). Sem navegador |
| `js/robot.js` | Robô piloto: controla atitude e translação só pelas alavancas, desvia de pedras. Usado pelos testes e pelo `dev.autoplay`. Sem navegador |
| `js/main.js` | Liga tudo: render, VR (alavancas pelas mãos, botões, vibração, recentralizar), teclado/mouse, câmeras, menus, eventos, sons, `dev` |
| `js/scene.js` | Céu (estrelas, Via Láctea, sol, planeta por capítulo em textura gerada, atmosfera), estações, satélite, pedras e detritos instanciados, argolas, astronauta, nave por fora com plumas dos propulsores, cabine com console e alavancas |
| `js/hud.js` | HUD de vidro da cabine (canvas): alvo, cruz de alinhamento, vetor de velocidade, números, combustível, dano |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados: propulsores, cabine, clunk do encaixe, batida, argola, resgate, alarmes |
| `js/save.js` | Progresso e opções |
| `tests/run.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8834, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: metros, mundo sem gravidade. Espaço local da nave e das estações: x direita, y cima,
-z frente (a nave) e +z é para onde o encaixe olha (as estações). Na nave: centro de massa na
origem, olhos em (0; 0,45; -0,55), ponta da sonda em (0; 0; -1,9), braço da janela em
(0,9; 0,3; -1,25). Estações giram em volta do eixo do próprio encaixe.

## Regras e convenções do projeto

- `math.js`, `bodies.js`, `sim.js`, `levels.js` e `robot.js` não podem usar navegador nem Three.js:
  os testes rodam no Node.
- `scene.js` desenha com as medidas de `bodies.js`: forma nova numa estação tem que entrar nos dois.
- Fase nova ou mudada: rodar `node tests/run.js`, olhar os tempos e o combustível do robô e acertar
  `stars` (3 estrelas com pelo menos 40% de folga sobre o robô; o teste confere).
- O robô só pode usar os comandos que o jogador tem (alavancas de -1 a 1 e estabilizar).
- Os testes nunca tocam som.

## Decisões

- Física própria em 3D com passo fixo de 1/60 s; no navegador a nave e a estação são interpoladas
  entre os passos (no VR a câmera está presa na nave, então tremida apareceria no mundo todo).
- Espaço livre, sem mecânica orbital (sem equações de Hill): "nada freia sozinho" fica fácil de
  sentir. A Terra/planeta é só cenário.
- Massa de combustível ignorada; o satélite capturado soma massa e inércia (o mesmo empuxo acelera
  menos), mas o empuxo continua passando pelo centro original.
- Batidas mudam só a velocidade da nave (não giram a nave): mais calmo e previsível.
- Empuxo proporcional à alavanca (tanto o empuxo quanto o gasto); no teclado é tudo ou nada, com
  Shift para 30%.
- Giro limitado a 20°/s por eixo e vinheta opcional no VR quando a nave gira (conforto). A cabine é
  o referencial fixo: arcos da cúpula, console e alavancas sempre visíveis.
- Estrelas calibradas pelo robô: 3 estrelas = combustível ≤ robô×1,6+3 e tempo ≤ robô×1,8+30;
  2 estrelas = combustível ≤ robô×2,8+6 e tempo ≤ robô×3+60.
- Visual: sol forte vindo de trás do jogador (ilumina a face do encaixe), planeta enorme diferente
  por capítulo (Terra estilizada, gigante gasoso com anéis, planeta de gelo com lua), estações em
  branco, dourado e azul dos painéis, HUD verde-menta. Sem sombras.
- Desempenho de Quest: pixelRatio 1, foveação, pedras e detritos instanciados, céu e planeta em
  shader simples, 2 luzes sem sombra, sem pós-processamento.
- Porta do servidor local 8834.

## Pendências / problemas conhecidos

- **Nada foi testado no Quest ainda**: alavancas pelas mãos (sensibilidade de 7 cm e 25°/30°, zona
  morta, sentido da arfagem), pegar astronauta com a mão (alcance 0,55 m), recentralizar e altura,
  conforto (giro, vinheta), vibração, pinça no rastreamento de mãos, FPS no óculos.
- Os limites das estrelas foram calibrados pelo robô, que é muito mais eficiente que uma pessoa;
  podem precisar de folga maior depois de jogar.
- Sons só foram checados por não dar erro; ninguém ouviu ainda.
- Ainda não publicado no site nem listado no `SiteJogos`.
