from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request
from catalog import BRANDS
root=Path(__file__).parent/'dist/assets/brands'
root.mkdir(exist_ok=True)
base='https://cdn.jsdelivr.net/npm/simple-icons@11.15.0/'
colors={'adobephotoshop':'31A8FF','adobeillustrator':'DB7100','adobepremierepro':'7162B4','adobeaftereffects':'7162B4','canva':'00A7AC','figma':'F24E1E','youtube':'E62117','instagram':'C13584','facebook':'1877F2','googleads':'4285F4','meta':'0866FF','wordpress':'21759B','shopify':'6F9441','html5':'E34F26'}
def fetch(name):
    data=urllib.request.urlopen(base+'icons/'+name+'.svg',timeout=20).read()
    assert b'<svg' in data
    data=data.replace(b'<svg ',('<svg fill="#'+colors[name]+'" ').encode(),1)
    (root/(name+'.svg')).write_bytes(data)
    return name,len(data)
with ThreadPoolExecutor(max_workers=6) as pool:
    for result in pool.map(fetch,BRANDS):print(*result)
(root/'LICENSE.md').write_bytes(urllib.request.urlopen(base+'LICENSE.md').read())
(root/'SOURCE.txt').write_text('Software and platform marks sourced from Simple Icons 11.15.0 (CC0).\nhttps://github.com/simple-icons/simple-icons/tree/11.15.0\nBrand names and marks belong to their respective owners. Display does not imply endorsement or partnership.\n')
