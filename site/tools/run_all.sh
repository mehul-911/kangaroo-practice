#!/bin/bash
# Rebuild every image in ../bank from the original PDFs (adjust paths).
cd "$(dirname "$0")"; U=/mnt/user-data/uploads; F=$U/document_compress.pdf
x(){ python3 extract.py --pdf $F --pages $2 --id $1 --cols 1 --dpi 150 "${@:3}" 2>&1 | grep -v -i warn | tail -1; }
x ksf2012 2-6; x ksf2013 7-11; x ksf2014 12-17; x ksf2015 18-25
x ksf2016 26-32 --manual 3:1:705,11:4:420,17:5:836 --shift 5:-20
x ksf2017 33-40 --manual 1:1:285,10:4:985
x ksf2018 41-50; x ksf2019 51-56
x ksf2020 57-64 --manual 9:3:1118,15:5:885,23:7:1062
x ksf2021 65-69; x ksf2022 70-76 --manual 7:3:238; x ksf2023 77-84
python3 extract.py --pdf $U/document_compress__1_.pdf --pages 1-4 --id usa2024 --cols 2 --dpi 200 2>&1 | grep -v -i warn | tail -1
python3 extract.py --pdf $U/document_compress__2_.pdf --pages 1-4 --id usa2025 --cols 2 --dpi 200 --hdr1 .255 --fromtop 4 --shift 23:-70 2>&1 | grep -v -i warn | tail -1
