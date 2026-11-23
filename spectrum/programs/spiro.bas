10 REM SPIROGRAPH (after ZX Printer manual program 3a)
20 CLS
30 FOR i=-4 TO 4
40 FOR j=0 TO 240
50 PLOT 128+80*SIN (j/120*PI),88+80*COS (j/120*PI+i/4*PI)
60 NEXT j
70 NEXT i
80 PRINT AT 21,0;"Type COPY to print this"
