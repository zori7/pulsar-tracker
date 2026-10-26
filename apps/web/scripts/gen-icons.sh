#!/usr/bin/env bash
# Regenerates the PWA PNG icons. The mark is drawn with ImageMagick primitives
# (no SVG delegate needed): a pulsar star — bright core, violet halo,
# violet + teal pulse rings on deep-space navy.
# Usage: bash apps/web/scripts/gen-icons.sh
set -euo pipefail
cd "$(dirname "$0")/../public"

py() { python3 -c "print($1)"; }

# art <size> <motif-scale> <out.png> <rounded|square>
art() {
  local size="$1" scale="$2" out="$3" mode="$4"
  local c=$((size / 2))
  local r1 r2 core sw1 sw2 rr
  r1=$(py "round($c*0.309*$scale)")    # teal ring radius (158/512)
  r2=$(py "round($c*0.195*$scale)")    # violet ring radius (100/512)
  core=$(py "round($c*0.141*$scale)")  # white core radius (15/512)
  sw1=$(py "max(2, round($size*0.0195*$scale))")  # teal stroke
  sw2=$(py "max(2, round($size*0.0254*$scale))")  # violet stroke
  rr=$(py "round($size*0.203)")        # corner radius

  magick -size "${size}x${size}" xc:'#0B1020FF' \
    \( -size "$(py "round($size*0.62)")x$(py "round($size*0.62)")" radial-gradient:'#8B7CF840-#8B7CF800' \) -gravity Center -composite \
    \( -size "$(py "round($size*0.42)")x$(py "round($size*0.42)")" radial-gradient:'#8B7CF880-#8B7CF800' \) -gravity Center -composite \
    -fill none -stroke '#3FD6C859' -strokewidth "$sw1" -draw "circle $c,$c $c,$((c - r1))" \
    -fill none -stroke '#8B7CF8B2' -strokewidth "$sw2" -draw "circle $c,$c $c,$((c - r2))" \
    \( -size "$(py "round($size*0.36)")x$(py "round($size*0.36)")" radial-gradient:'#CFC6FF-#8B7CF800' \) -gravity Center -composite \
    -fill '#FFFFFFFF' -draw "circle $c,$c $c,$((c - core))" \
    -fill '#E9EDFA80' -draw "circle $((size*2/25)),$((size*23/100)) $((size*2/25)),$((size*23/100+size*8/512))" \
    -fill '#3FD6C88C' -draw "circle $((size*82/100)),$((size*29/100)) $((size*82/100)),$((size*29/100+size*6/512))" \
    -fill '#E9EDFA66' -draw "circle $((size*78/100)),$((size*76/100)) $((size*78/100)),$((size*76/100+size*8/512))" \
    -fill '#8B7CF8A6' -draw "circle $((size*24/100)),$((size*78/100)) $((size*24/100)),$((size*78/100+size*6/512))" \
    "$out"
  if [ "$mode" = rounded ]; then
    magick "$out" \( -size "${size}x${size}" xc:none -fill white \
      -draw "roundrectangle 0,0,$((size-1)),$((size-1)),$rr,$rr" \) \
      -alpha off -compose CopyOpacity -composite "$out"
  fi
}

art 512 1.00 pwa-512x512.png     rounded
art 192 1.00 pwa-192x192.png     rounded
art 180 1.00 apple-touch-icon.png rounded
art 512 0.62 maskable-512x512.png square

echo "Icons written:"
ls -1 pwa-192x192.png pwa-512x512.png apple-touch-icon.png maskable-512x512.png
