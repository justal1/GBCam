10 REM CIRCLES (after ZX Printer manual program 3)
20 CLS
30 FOR j=1 TO 10
40 FOR i=0 TO j*48
50 PLOT 128+j*8*SIN (i/(j*24)*PI),88+j*8*COS (i/(j*24)*PI)
60 NEXT i
70 NEXT j
80 PRINT AT 21,0;"Type COPY to print this"
