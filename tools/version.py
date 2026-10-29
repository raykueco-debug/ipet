"""Set the app's version: the label in the top bar, ?v= on every script and stylesheet in index.html (so a
tablet's cache can't keep old code after a push) and the service worker's cache name.

usage: python tools/version.py            next number of the day: 2026.10.29-1, -2, …
       python tools/version.py <version>  that one
"""
import datetime
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML, SW = os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'sw.js')


def main(args):
    html = open(HTML, encoding='utf-8').read()
    if args:
        v = args[0]
    else:
        day = datetime.date.today().strftime('%Y.%m.%d')
        m = re.search(r'id="ver">v([\d.]+)-(\d+)<', html)
        v = f'{day}-{int(m.group(2)) + 1 if m and m.group(1) == day else 1}'
    html = re.sub(r'id="ver">v[^<]*<', f'id="ver">v{v}<', html)
    html = re.sub(r'((?:src|href)="(?!https?:)[\w/.-]+\.(?:js|css))(\?v=[^"]*)?"', rf'\1?v={v}"', html)
    open(HTML, 'w', encoding='utf-8', newline='\n').write(html)
    sw = open(SW, encoding='utf-8').read()
    open(SW, 'w', encoding='utf-8', newline='\n').write(re.sub(r"const VERSION = '[^']*'", f"const VERSION = 'ipet-{v}'", sw))
    print('v' + v)


if __name__ == '__main__':
    main(sys.argv[1:])
