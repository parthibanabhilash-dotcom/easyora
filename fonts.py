from pathlib import Path
import urllib.request,re
request=urllib.request.Request('https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Manrope:wght@200..800&display=swap',headers={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'})
css=urllib.request.urlopen(request).read().decode()
for block in css.split('@font-face')[1:]:
    if 'U+0000-00FF' not in block: continue
    name=re.search("font-family: '([^']+)'",block).group(1).lower()
    url=re.search(r'url\(([^)]+)',block).group(1)
    Path('dist/assets/'+name+'.woff2').write_bytes(urllib.request.urlopen(url).read())
print('Downloaded local variable fonts')
