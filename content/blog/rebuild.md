---
title: Rebuilding My Site (Again) With 11ty
description: This one's a keeper!
date: 2026-03-17
tags: blog
---
I've lost count of how many times I've rebuilt my personal blog. First it was
plain HTML/CSS. Then React and Tailwind, after a full-stack role turned me down
for not having any React projects on my GitHub. Then my first 11ty site, with
some Three.js demos. Then I tried building my own static site generator, first
with Next.js, then in plain JS because the Next version got too complex. Don't
ask me why I thought ditching the framework would make things simpler...

<br>

After all of that, I developed a pretty clear picture of what I actually want.
Content that lives separately from the site plumbing, so I'm not rewriting posts
every time I rework the internals. Something simple enough that I can come back
after six months away and immediately understand how the pieces fit together.
Modular, easy to extend, and able to handle everything from plain blog posts to
live graphics demos without feeling like a hack.

<br>

11ty hits all of those marks. Your filesystem is your sitemap; the directory
structure doubles as site configuration, readable at a glance. The data
cascade lets you attach metadata and settings to entire branches of that
structure, giving you a lot of flexibility without a lot of ceremony. And the
template-centric design keeps content cleanly separated from implementation, so
the two can evolve independently.
