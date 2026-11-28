"""Aumenta a versão do app (número + data/hora de Brasília) em app.js, versao.json e index.html (?v=).
Uso: python3 ferramentas/nova-versao.py"""
import re, json, datetime, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent / 'docs'
agora = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-3))).strftime('%d/%m/%Y %H:%M')
app = (raiz / 'app.js').read_text()
v = int(re.search(r'var VERSAO = (\d+)', app).group(1)) + 1
app = re.sub(r"var VERSAO = \d+, VERSAO_DATA = '[^']*'", f"var VERSAO = {v}, VERSAO_DATA = '{agora}'", app)
(raiz / 'app.js').write_text(app)
(raiz / 'versao.json').write_text(json.dumps({'versao': v, 'data': agora}) + '\n')
idx = (raiz / 'index.html').read_text()
idx = re.sub(r'\?v=\d+', f'?v={v}', idx)
(raiz / 'index.html').write_text(idx)
print(f'versão {v} · {agora}')
