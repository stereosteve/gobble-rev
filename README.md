# gobble-rev

Asset revisioning through file content hash

## Installation

First, you need to have gobble installed - see the [gobble readme](https://github.com/gobblejs/gobble) for details. Then,

```bash
npm i -D gobble-rev
```

## Usage

**gobblefile.js**

```js
var gobble = require( 'gobble' );

var root = gobble( 'src/root' );
var styles = gobble( 'src/styles' );
var scripts = gobble( 'src/scripts' );

module.exports = gobble([ root, styles, scripts ]).transform( 'rev' );
```

## License

MIT. Copyright 2016 Ali Sabil
