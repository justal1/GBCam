10 REM SKETCHPAD (after ZX Printer manual program 5)
20 REM 1 draw  0 rub out  2 move  3 print  5 left 6 down 7 up 8 right
30 CLS
40 LET x=128: LET y=88: LET m=1
50 LET k$=INKEY$
60 IF k$="1" THEN LET m=1
70 IF k$="0" THEN LET m=0
80 IF k$="2" THEN LET m=2
90 IF k$="3" THEN COPY : PAUSE 50
100 IF k$="5" AND x>1 THEN LET x=x-2
110 IF k$="8" AND x<254 THEN LET x=x+2
120 IF k$="6" AND y>1 THEN LET y=y-2
130 IF k$="7" AND y<174 THEN LET y=y+2
140 IF m=1 THEN PLOT x,y: PLOT x+1,y: PLOT x,y+1: PLOT x+1,y+1
150 IF m=0 THEN PLOT INVERSE 1;x,y: PLOT INVERSE 1;x+1,y: PLOT INVERSE 1;x,y+1: PLOT INVERSE 1;x+1,y+1
160 IF m=2 THEN PLOT OVER 1;x,y: PLOT OVER 1;x,y
170 GO TO 50
