#!/bin/sh

appname=bfthumbnail

cp buildscript/makexpi.sh ./
./makexpi.sh -n $appname -o
rm ./makexpi.sh

