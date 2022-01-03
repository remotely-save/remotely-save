# the logo

Some different sizes' logos are needed.

## license

<a rel="license" href="http://creativecommons.org/licenses/by-sa/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-sa/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by-sa/4.0/">Creative Commons Attribution-ShareAlike 4.0 International License</a>.

## the process of creation

No professional designers are here. Thus the following steps involve many programer styles. :-)

1. use excalidraw and export png and svg.

    ```bash
    # results
    logo.excalidraw
    logo.png
    logo.svg
    ```

2. manually edit the `logo.svg` and make background transparent.

    ```bash
    # results
    logo-transparent.svg
    ```

3. use python library [`svgutils`](https://github.com/btel/svg_utils) to make a strictly square figure. The [doc](https://svgutils.readthedocs.io/en/latest/tutorials/composing_multipanel_figures.html) is very useful.

    ```python
    from svgutils.compose import *
    def get_standard_300x300(file_name):
        fig = Figure(300, 300, 
            Panel(
                SVG(file_name),
            ).move(-3, 12),
        )
        return fig

    get_standard_300x300('logo-transparent.svg').save('300x300.svg')

    # def get_other_size_from_standard(file_name, px):
    #     fig = Figure(px, px, 
    #         Panel(
    #             SVG(file_name).scale(px/300.0),
    #         ).move(-3*px/300.0, 12*px/300.0),
    #     )
    #     return fig

    # get_other_size_from_standard('logo.svg',256).save('256x256.svg')
    ```

    ```bash
    # results
    300x300.svg
    ```

4. use `inkscape` command line to get different sizes' `.png` files.

    ```bash
    inkscape 300x300.svg -o 300x300.png

    inkscape 300x300.svg -o 50x50.png -w 50 -h 50
    
    inkscape 300x300.svg -o 64x64.png -w 64 -h 64
    inkscape 300x300.svg -o 256x256.png -w 256 -h 256
    ```

    ```bash
    # results
    50x50.png
    64x64.png
    256x256.png
    ```
