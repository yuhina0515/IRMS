# IRMS 設計語言 v2 — WCAG 2.x 對比度實算腳本(見 doc/UI_DESIGN_LANGUAGE_V2.md §3)。
# 執行:python3 doc/design-v2/contrast_check.py
# 門檻:一般文字 4.5:1;大字、圖表系列線與 UI 元件邊界 3:1(WCAG 1.4.3 / 1.4.11)。
# border 是裝飾性分隔線,不列門檻;需要辨識的控制項邊界用 controlBorder(extras 區段)。

def lum(h):
    h=h.lstrip('#'); c=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    c=[x/12.92 if x<=0.03928 else ((x+0.055)/1.055)**2.4 for x in c]
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]
def cr(a,b):
    la,lb=sorted([lum(a),lum(b)],reverse=True); return (la+0.05)/(lb+0.05)
def gray(h):
    return lum(h)
T={
 'light':dict(canvas='#F3F4F1',surface='#FFFFFF',raised='#E9ECE7',border='#C9CEC7',text='#1A1E1C',dim='#454D49',muted='#5F6863',
   accent='#1D5FA8',accentStrong='#174B86',success='#1B7340',warning='#8F5300',danger='#B3261E',thigh='#6E4FC0',shin='#08797A',roll='#A83A78',onAccent='#FFFFFF'),
 'dark':dict(canvas='#101312',surface='#171B1A',raised='#202523',border='#3A423E',text='#ECEFEC',dim='#BCC4BF',muted='#949D98',
   accent='#76AEF2',accentStrong='#A3C8F6',success='#52C28C',warning='#E3A03D',danger='#F27B70',thigh='#B7A1F2',shin='#4CC6C4',roll='#EA86C0',onAccent='#0E1A2A'),
}
for name,t in T.items():
    print('==',name)
    for bg in ('canvas','surface','raised'):
        for fg,th in (('text',4.5),('dim',4.5),('muted',4.5),('accentStrong',4.5),('success',4.5),('warning',4.5),('danger',4.5),('accent',3),('thigh',3),('shin',3),('roll',3),('border',None)):
            r=cr(t[fg],t[bg]); flag='' if th is None else ('OK' if r>=th else 'FAIL')
            print(f'{fg:>12} on {bg:<8} {r:5.2f} {flag}')
    print(f'onAccent on accent {cr(t["onAccent"],t["accent"]):.2f}')
    print(f'white on danger {cr("#FFFFFF",t["danger"]):.2f}  dark-on-danger {cr(t["canvas"],t["danger"]):.2f}')
    print('series luminance', {k:round(gray(t[k]),3) for k in ('thigh','shin','roll','accent')})
print('==== extras')
def mix(fg,bg,a):
    f=[int(fg[i:i+2],16) for i in (1,3,5)]; b=[int(bg[i:i+2],16) for i in (1,3,5)]
    return '#'+''.join(f'{round(x*a+y*(1-a)):02X}' for x,y in zip(f,b))
for name,t,cb in (('light',T['light'],'#7A837E'),('dark',T['dark'],'#6E7873')):
    for bg in ('canvas','surface','raised'): print(name,'controlBorder',cb,'on',bg,round(cr(cb,t[bg]),2))
    for k,a in (('danger',0.12),('success',0.12),('accent',0.10)):
        tint=mix(t[k],t['surface'],a)
        print(name,k,'tint',tint,'text',round(cr(t['text'],tint),2),'dim',round(cr(t['dim'],tint),2),k,round(cr(t[k],tint),2))
