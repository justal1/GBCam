10 REM BIG LETTERS (after ZX Printer manual program 2)
20 INPUT "Type up to 40 letters: ";a$
30 IF LEN a$>40 THEN LET a$=a$( TO 40)
40 CLS
50 FOR n=1 TO LEN a$
60 LET c=n-1: LET x0=32*(c-8*INT (c/8)): LET y0=175-32*(INT (c/8)+1)
70 FOR s=0 TO 7
80 LET p=PEEK (15360+8*CODE a$(n)+s)
90 FOR b=7 TO 0 STEP -1
100 IF p>=2^b THEN LET p=p-2^b: FOR d=0 TO 3: PLOT x0+4*(7-b),y0+4*(7-s)+d: DRAW 3,0: NEXT d
110 NEXT b
120 NEXT s
130 NEXT n
140 PRINT AT 21,0;"Type COPY to print this"
