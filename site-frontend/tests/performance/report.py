"""Summarize matching synthetic runs; never interpret HTTP 200 as complete content."""
import json
import statistics
import subprocess
import os
from pathlib import Path
root = Path(__file__).resolve().parents[3]
folder = root / 'output/navigation-performance'
before = json.loads((folder/'before.json').read_text())
after = json.loads((folder/'after.json').read_text())
assert before['conditions'] == after['conditions'], 'Cannot compare different fixtures'
assert before['conditions']['couponItems'] == 4
paths = {'recompensas':'Inicio','beneficios':'Beneficios','cursos':'Cursos','productos':'Productos','activities':'Actividad'}
scenarios = {'healthy':'Normal','slow':'Lento','outage':'Fallo'}
def subset(data, scenario, mode, path):
    return [r for r in data['records'] if (r['scenario'],r['mode'],r['path'])==(scenario,mode,path)]
def median(rows, field):
    values=[r[field] for r in rows if r.get(field) is not None]
    return str(round(statistics.median(values))) if values else '—'
lines=['## Resultados finales (milisegundos, medianas de tres muestras)', '',
       'Tiempo hasta HTML completo; el tiempo hasta cabeceras está en los JSON. No es pintura ni interacción de navegador.', '',
       '| Escenario | Página | Frío antes → después | Caliente antes → después |',
       '| --- | --- | ---: | ---: |']
for scenario, label in scenarios.items():
    for path, page in paths.items():
        values=[]
        for mode in ['cold','warm']:
            values.append(' → '.join(median(subset(data,scenario,mode,path),'totalMs') for data in [before,after]))
        lines.append(f'| {label} | {page} | {values[0]} | {values[1]} |')
lines += ['', 'Disponibilidad del contenido de la fixture (30 respuestas por escenario):', '',
          '| Escenario | HTTP 200 antes / después | Contenido principal antes / después | Todos los datos mostrados, incluido saldo, antes / después |',
          '| --- | ---: | ---: | ---: |']
for scenario,label in scenarios.items():
    sets=[[r for r in data['records'] if r['scenario']==scenario] for data in [before,after]]
    values=[' / '.join(str(sum(r['status']==200 for r in rows))+'/30' for rows in sets),
            ' / '.join(str(sum(r['contentReady'] for r in rows))+'/30' for rows in sets),
            ' / '.join(str(sum(r['allDisplayedDataMs'] is not None for r in rows))+'/30' for rows in sets)]
    lines.append(f'| {label} | '+ ' | '.join(values)+' |')
lines += ['', 'Tiempo hasta todos los datos mostrados, en escenario lento y frío. En la versión nueva suma el HTML y la consulta de saldo posterior simulada por HTTP; no mide JS, pintura ni descarga de imágenes.', '',
          '| Página | Antes | Después |', '| --- | ---: | ---: |']
for path,page in paths.items():
    lines.append(f"| {page} | {median(subset(before,'slow','cold',path),'allDisplayedDataMs')} | {median(subset(after,'slow','cold',path),'allDisplayedDataMs')} |")
lines += ['', 'Contadores sobre 90 navegaciones (las consultas SQL son sólo las del resumen simulado):', '',
          '| Fase | Identidad | Portal | Wallet remoto | SQL simulado |', '| --- | ---: | ---: | ---: | ---: |']
for name,data,phase in [('Antes SSR',before,'calls'),('Después SSR',after,'calls'),('Después saldo diferido',after,'deferredCalls')]:
    totals=[sum(r.get(phase,{}).get(key,0) for r in data['records']) for key in ['identity','portal','wallet','sql']]
    lines.append(f'| {name} | '+' | '.join(map(str,totals))+' |')
lines += ['', '**Interpretación:** la dependencia remota del saldo sale de SSR y Productos/Actividad pueden mostrar datos locales antes. El saldo completo puede llegar después; no se promete que toda la página termine antes. La versión final conserva el éxito de catálogos lentos y muestra fallos cuando realmente fallan. Agrupar módulos por petición reduce identidad SSR (204 → 180); al sumar el saldo diferido son 256 lecturas. Retirar la caché resuelta aumenta portales (66 → 90) y mantiene una regresión caliente en Beneficios y Productos. Se deja explícita para revisión, sin volver a reutilizar sesiones, permisos o balances antiguos. No extrapolar un porcentaje global ni tiempos productivos.', '']
report='\n'.join(lines)
(folder/'comparison.md').write_text(report)
p=root/'docs/navigation-performance-local.md'
s=p.read_text();start=s.index('<!-- RESULTS -->');end=s.index('<!-- END RESULTS -->',start)+len('<!-- END RESULTS -->')
p.write_text(s[:start]+'<!-- RESULTS -->\n'+report+'<!-- END RESULTS -->'+s[end:])
env={**os.environ,'DEVELOPER_DIR':'/Library/Developer/CommandLineTools'}
patch=subprocess.check_output(['git','diff','--binary'],cwd=root,env=env)
new=subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,env=env).decode().splitlines()
for path in new:
    if path.startswith(('output/','tmp/')): continue
    patch+=subprocess.run(['git','diff','--no-index','--binary','--','/dev/null',path],cwd=root,env=env,stdout=subprocess.PIPE,check=False).stdout
(folder/'changes.patch').write_bytes(patch)
print(report)
