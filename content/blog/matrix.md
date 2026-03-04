---
title: Matrix (-like) Effect
description: Kinda looks like the matrix!
date: 2024-12-15
tags: number 1
---

During the winter of 2024 I was applying to jobs, checking out the websites of various companies and I came across one that
had this cool animation on the homepage of these walls of binary data stretching into the distance. I don't even remember the
company, I think it was some local software house, but I still remember the effect. It was pretty slick. I guess that's the
kind of stuff you come up with when you bill by the hour. Seeing that made me want to try my hand at doing some kind of
matrix-inspired shader effect, so this is what I came up with.

<iframe src="/demos/matrix" title="Matrix Effect Demo"> </iframe>

## Explanation

I found a bitmap of some 8 by 8 font from a Hitachi LCD display and converted it to a base64 string that ThreeJS could load as
a data texture that way I could bundle it in with the script itself. Used some algebra to come up with grid coordinates for
each fragment based on the UV coordinate and assign each one a random (ish) character from the bitmap which is sampled
according to the fragment's position relative to its grid cell. Lots of modulus operations. The pseudo random character
selection is also made a variable of some truncated portion of the current time to get the characters to update with time. I
also gave each grid character a random amount of variability which is why some flicker between many different characters and
others stay more or less the same. Then I layered on some undulating per-character brightnesses and some vertically scrolling
scanlines with sine and cosine operations. The result is something kind of lo-fi, not quite as nice as the thing that inspired
it but I kind of like it. I made it amber in color because I love those old amber displays like in the Compaq Portable 3 and
the Grid Compass.

## Shader Source

```glsl
varying vec2 vUv;
varying vec3 vPosition;

uniform float time;
uniform sampler2D font;

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

void main()	{

  vec2 uv = vUv;

  // dilate the texture coordinates a bit
  uv.xy *= 6.7;

  // scroll up with time and be sure to handle the wrap around case
  uv.y += 0.1 * time;

  // Create a perspective effect using vPosition
  float depth = abs(vPosition.z);
  uv /= depth * 0.1 + 1.0; // Compress UVs with distance for a tunnel effect

  float truncated_time = time - fract(time);
  float fps = 0.1;
  truncated_time = time - fract(time * fps)/fps;

  // compute the block the current uv value lies in
  vec2 block = floor(uv.xy * 16.0);

  // select random character
  float rindex = floor(random(block + fps) * 224.0 + 15.0); // Character index (0 to 255)

  // random choice between the selected character and a completely random character
  float threshold = random(block + truncated_time * 0.02) * 0.6;
  float outcome = random(block + time * 0.02);
  float choice = floor(outcome * 224.0 + 15.0);

  if (outcome > threshold + 0.4) {
    rindex = choice;
  }

  // convert selection to indices
  float col = mod(rindex, 16.0); // Column (0 to 15)
  float row = floor(rindex * 0.0625); // Row (0 to 15)

  // compute base uv offset for selected character
  vec2 rindex_uv = vec2(col, row) * 0.0625;

  // compute the uv offset of the current fragment
  vec2 frag_uv = fract(uv * 16.0) * 0.0625;

  // compute translated uv
  vec2 trans_uv = rindex_uv + frag_uv;

  // text color
  vec4 text_color = vec4(0.9, 0.6, 0.0, 1.0);

  // sample the bitmap
  vec4 color = 0.95 * texture(font, fract(trans_uv)) * text_color;
  vec4 scanlines = vec4(vec3(0.1*sin(uv.y * 3.14 * 50.0 + time * 10.2)), 0.0);
  color = color * vec4(vec3(abs(sin(random(block) * 6.28 + 3.14 * time))), 1.0) + scanlines;
  gl_FragColor = color;
}
```
