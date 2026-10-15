from html.parser import HTMLParser
from pathlib import Path
import urllib.request
from urllib.parse import urlsplit
root=Path(__file__).parent/'dist'
class Page(HTMLParser):
    def __init__(self,text):
        super().__init__(); self.links=[]; self.ids=set(); self.h1=0; self.feed(text)
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a: self.ids.add(a['id'])
        if tag=='h1': self.h1+=1
        for attr in ['href','src']:
            if attr in a:self.links.append(a[attr])
pages={p.name:Page(p.read_text(encoding='utf-8')) for p in root.glob('*.html')}
count=0
for name,page in pages.items():
    assert page.h1==1,(name,'heading')
    for link in page.links:
        if link.startswith('https:'):continue
        parsed=urlsplit(link)
        path,anchor=parsed.path,parsed.fragment
        dest=root/path.lstrip('/') if path else root/name
        assert dest.is_file(),(name,link)
        if anchor:assert anchor in pages[dest.name].ids,(name,link)
        count+=1
    r=urllib.request.urlopen('http://127.0.0.1:4173/'+name)
    assert r.status==200
css=(root/'assets/style.css').read_text()
assert 'prefers-reduced-motion:reduce' in css
js=(root/'assets/main.js').read_text()
assert not any(x in js for x in ['localStorage','sessionStorage','fetch(','XMLHttpRequest'])
print(f'PASS: {len(pages)} pages served, {count} local links/assets/anchors resolved; one H1 per page, reduced-motion styles and no form transmission/storage.')
