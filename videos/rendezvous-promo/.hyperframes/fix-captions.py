# Re-applies the caption fixes after `captions.mjs build`: local brand fonts
# (the capture manifest names them without files, so the builder skips them),
# root-relative asset paths, and sentence case (the brand never uses all caps).
p = 'compositions/captions.html'
s = open(p).read()
if '@font-face' not in s:
    faces = ("    @font-face { font-family: 'Big Shoulders'; src: url('assets/fonts/Big_Shoulders-latin.woff2') format('woff2'); font-weight: 400 900; font-style: normal; font-display: block; }\n"
             "    @font-face { font-family: 'Atkinson Hyperlegible Next'; src: url('assets/fonts/Atkinson_Hyperlegible_Next-latin.woff2') format('woff2'); font-weight: 300 800; font-style: normal; font-display: block; }\n")
    i = s.index('<style>') + len('<style>\n')
    s = s[:i] + faces + s[i:]
s = s.replace('text-transform: uppercase;', 'text-transform: none;')
open(p, 'w').write(s)
print('captions fixed')
