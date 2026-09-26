# Alert theme sources

The title and SVG definitions in this directory and the colors in `../palette.css`
are adapted from [rehype-callouts 2.2.0](https://github.com/lin-stephanie/rehype-callouts/tree/704cf4da9bb5ac8fe6dfda5350d382d9d7c36a1d/src/themes)
by Stephanie Lin, under the MIT license reproduced in `LICENSE`.

Integration was inspired by [Firefly](https://github.com/CuteLeaf/Firefly), which
uses this plugin in its Markdown pipeline. This project renders MDC components
instead, with isolated per-instance themes and the existing BaseCollapsible.

SVG strings are trusted, checked-in assets only. Never accept SVG markup from
article props or external responses. Theme layout rules are adapted in Alert.vue;
upstream global CSS is not imported because all four themes coexist on one page.
