# Third-party notices

Vibe Desktop is Apache-2.0 licensed. It uses third-party open-source packages
whose names, versions, resolved sources, and integrity hashes are recorded in
`package-lock.json`. Their own license terms continue to apply.

The installer may download the pinned official Node.js binary identified in the
source and verifies its SHA-256 digest before use. Catalog recipes may download
reviewed third-party applications and container images only after the user
starts an installation; those applications are separate works governed by
their upstream licenses.

Vibe Desktop does not relicense third-party application source, container
images, fonts, icons, or trademarks. Product and project names remain the
property of their respective owners.

## Vendored source

`src/app/shadcn-tailwind.css` is copied unmodified from the `shadcn` package
(version 4.22.1, `dist/tailwind.css`) so the build does not depend on the shadcn
CLI. It is distributed under the MIT License:

> Copyright (c) 2023 shadcn
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.
