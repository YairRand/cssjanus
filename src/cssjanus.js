/*!
 * Transforms CSS stylesheets between directions.
 * https://github.com/cssjanus/cssjanus
 *
 * Copyright 2008 Google Inc.
 * Copyright 2010 Trevor Parscal
 */

var cssjanus;

/**
 * Create a tokenizer object.
 *
 * This utility class is used by CSSJanus to protect strings by replacing them temporarily with
 * tokens and later transforming them back.
 *
 * @author Trevor Parscal
 * @author Roan Kattouw
 *
 * @class
 * @constructor
 * @param {RegExp} regex Regular expression whose matches to replace by a token
 * @param {string} token Placeholder text
 */
function Tokenizer( regex, token ) {

	var matches = [],
		index = 0;

	/**
	 * Add a match.
	 *
	 * @private
	 * @param {string} match Matched string
	 * @return {string} Token to leave in the matched string's place
	 */
	function tokenizeCallback( match ) {
		matches.push( match );
		return token;
	}

	/**
	 * Get a match.
	 *
	 * @private
	 * @return {string} Original matched string to restore
	 */
	function detokenizeCallback() {
		return matches[ index++ ];
	}

	return {
		/**
		 * Replace matching strings with tokens.
		 *
		 * @param {string} str String to tokenize
		 * @return {string} Tokenized string
		 */
		tokenize: function ( str ) {
			return str.replace( regex, tokenizeCallback );
		},

		/**
		 * Restores tokens to their original values.
		 *
		 * @param {string} str String previously run through tokenize()
		 * @return {string} Original string
		 */
		detokenize: function ( str ) {
			return str.replace( new RegExp( '(' + token + ')', 'g' ), detokenizeCallback );
		}
	};
}

/**
 * Create a CSSJanus object.
 *
 * CSSJanus changes the directions of CSS rules so that a stylesheet can be transformed to a stylesheet
 * with a different direction and orientation automatically. Processing can be bypassed for an entire
 * rule or a single property by adding a / * @noflip * / comment above the rule or property.
 *
 * @author Trevor Parscal <trevorparscal@gmail.com>
 * @author Roan Kattouw <roankattouw@gmail.com>
 * @author Lindsey Simon <elsigh@google.com>
 * @author Roozbeh Pournader <roozbeh@gmail.com>
 * @author Bryon Engelhardt <ebryon77@gmail.com>
 * @author Yair Rand <yyairrand@gmail.com>
 *
 * @class
 * @constructor
 */
function CSSJanus() {

	const
		sides = [ 'top', 'right', 'bottom', 'left' ],
		cursors = [ 'n', 'e', 's', 'w' ],
		wmDirs = [ 'tb', 'rl', 'bt', 'lr' ],
		directions = {
			tb: 0,
			rl: 1,
			bt: 2,
			lr: 3
		},
		// Tokens
		noFlipSingleToken = '`NOFLIP_SINGLE`',
		noFlipClassToken = '`NOFLIP_CLASS`',
		commentToken = '`COMMENT`',
		calcToken = '`CALC$1`',
		calcPattern = '`CALC\\d+`',
		// Patterns
		nonAsciiPattern = '[^\\u0020-\\u007e]',
		unicodePattern = '(?:(?:\\\\[0-9a-f]{1,6})(?:\\r\\n|\\s)?)',
		numPattern = '(?:[0-9]*\\.[0-9]+|[0-9]+)(?:[eE][-+]?[0-9+])?',
		unitPattern = '(?:em|ex|px|cm|mm|in|pt|pc|q|rem|ch|vh|vw|vmax|vmin|deg|rad|grad|ms|s|hz|khz|%)(?![a-z])',
		// Whitespace
		_ = `(?:\\s|${ commentToken })*`,
		ws = `(?:\\s|${ commentToken })+`,
		sws = `(${ ws })`,
		colon = _ + ':' + _,
		slash = _ + '/' + _,
		comma = _ + ',' + _,
		directionPattern = 'direction' + colon,
		urlSpecialCharsPattern = '[!#$%&*-~]',
		validAfterUriCharsPattern = '[\'"]?' + _,
		nonLetterPattern = '(^|[^a-zA-Z])',
		noFlipPattern = '\\/\\*\\!?\\s*@noflip\\s*\\*\\/',
		commentPattern = '\\/\\*[^*]*\\*+([^\\/*][^*]*\\*+)*\\/',
		escapePattern = `(?:${ unicodePattern }|\\\\[^\\r\\n\\f0-9a-f])`,
		nmstartPattern = `(?:[_a-z]|${ nonAsciiPattern }|${ escapePattern })`,
		nmcharPattern = `(?:[_a-z0-9-]|${ nonAsciiPattern }|${ escapePattern })`,
		identPattern = '-?' + nmstartPattern + nmcharPattern + '*',
		stringPattern = `(?:"(?:[^\\\"\n]|${ escapePattern }|\\\n)*"|'(?:[^\\\'\n]|${ escapePattern }|\\\n)*')`,
		quantPattern = `(?:[-+]?${ numPattern }(?:\\s*${ unitPattern }|${ identPattern })?|-?${ calcPattern })`,
		posQuantPattern = `(?:\\+?${ numPattern }(?:\\s*${ unitPattern }|${ identPattern })?|${ calcPattern })`,
		signedQuantPattern = `(${ quantPattern }|inherit|auto)`,
		colorPattern = '(?:' +
			// "rgb( 255, 255, 255 )"
			`(?:rgba?|hsla?)\\((?:${ quantPattern }|${ comma }|${ ws })+\\)` +
			// "red", also used for border style values ("dotted")
			`|${ nmstartPattern + nmcharPattern }*` +
			// "#FF0000"
			`|#${ nmcharPattern }+` +
		')',
		urlCharsPattern = `(?:${ urlSpecialCharsPattern }|${ nonAsciiPattern }|${ escapePattern })*`,
		urlPattern = `url\\(${ _ }(?:${ stringPattern }|${ urlCharsPattern })${ _ }\\)`,
		sidesPattern = 'top|right|bottom|left',
		edgesPattern = `(?:${ sidesPattern }|center)`,
		lookAheadNotLetterPattern = '(?![a-zA-Z])',
		lookAheadNotOpenBracePattern = `(?!(${ nmcharPattern }|\\r?\\n|\\s|#|\\:|\\.|\\,|\\+|>|\\(|\\)|\\[|\\]|\\*|=|~=|\\^=|\\$=|\\||${ stringPattern }|${ commentToken })*?{)`,
		lookAheadNotClosingParenPattern = `(?!${ urlCharsPattern }?${ validAfterUriCharsPattern }\\))`,
		lookAheadForClosingParenPattern = `(?=${ urlCharsPattern }?${ validAfterUriCharsPattern }\\))`,
		suffixPattern = `(${ _ }(?:!important${ _ })?[;}])`,
		anglePattern = `(?:([-+]?${ numPattern })((?:deg|g?rad|turn)?))`,
		colorStopsPattern = `${ colorPattern }(?:${ ws + quantPattern })?` +
			`(?:${ comma + colorPattern }(?:${ ws + quantPattern })?)+`,
		// Regular expressions
		commentRegExp = new RegExp( commentPattern, 'gi' ),
		charsWithinSelectorPattern = `(?:${ urlPattern }|${ stringPattern }|[^\\}])*?`,
		noFlipSingleRegExp = new RegExp( `(${ noFlipPattern + lookAheadNotOpenBracePattern }(${ urlPattern }|[^;}])+;?)`, 'gi' ),
		noFlipClassRegExp = new RegExp( `(${ noFlipPattern + charsWithinSelectorPattern }})`, 'gi' ),
		directionRegExp = new RegExp( `(${ directionPattern })(ltr|rtl)${ lookAheadNotLetterPattern }`, 'gi' ),
		sidesRegExp = new RegExp( nonLetterPattern +
			'(' +
				// These properties accept left/right, but not top/bottom. Flip, don't ever rotate.
				'(?:float|clear|text-align(?:-last)?)' + colon +
				// These properties shouldn't be flipped or rotated at all. Suppress change when present.
				`|(vertical-align${ colon }(?:text-)?|text-orientation${ colon }sideways-|caption-side${ colon })` +
			')?' +
			`(${ sidesPattern })` +
			lookAheadNotLetterPattern + lookAheadNotClosingParenPattern + lookAheadNotOpenBracePattern, 'gi' ),
		edgeInUrlRegExp = new RegExp( nonLetterPattern + '(' + sidesPattern + ')' + lookAheadNotLetterPattern + lookAheadForClosingParenPattern, 'gi' ),
		dirInUrlRegExp = new RegExp( nonLetterPattern + '(ltr|rtl|(?:tb|bt|vertical)-(?:lr|rl|inline)|(?:lr|rl|horizontal)-(?:tb|bt|inline))' + lookAheadNotLetterPattern + lookAheadForClosingParenPattern, 'gi' ),
		cursorRegExp = new RegExp( `(cursor${ colon })(?:([ns])?([ew])?-resize|((?:row|col|ns|ew|nesw|nwse)-resize|text|vertical-text))`, 'gi' ),
		fourNotationGroups = ( () => {
			const group = {
				'margin|padding|border-image-(?:width|outset)':	signedQuantPattern,
				'border-width':	`(${ quantPattern }|inherit|auto|thin|medium|thick)`,
				'border-color':	`(${ colorPattern })`,
				'border-style':	`(${ identPattern })`
			};
			return Object.keys( group ).map( properties => {
				const value = group[ properties ];
				return new RegExp( `((?:${ properties })${ colon })${ value + sws + value }` +
					`(?:${ sws + value }(?:${ sws + value })?)?${ suffixPattern }`, 'gi' );
			} );
		} )(),
		quantPlainUnitRegex = new RegExp( '[-+]?' + numPattern + unitPattern, 'gi' ),
		// Background-positions.
		bgRegExp = new RegExp( `(background(?:-position)?)(${ colon })((?:${ urlPattern }|[^;{}])+)`, 'gi' ),
		bgXYRegExp = new RegExp( `(background-position-[xy])(?:(${ colon })([^;{}]+)${ suffixPattern })?`, 'gi' ),
		positionValuesRegExp = new RegExp(
			'(^|\\s|,)' +
			// First-dimension position.
			`((${ edgesPattern }(?:${ ws + quantPattern }(?=${ ws + edgesPattern }))?)|${ quantPattern })` +
			// Second-dimension position.
			`(?:${ sws }((${ edgesPattern }(?:${ ws + quantPattern })?)|${ quantPattern }))?` +
			`(?:(${ slash })(${ posQuantPattern })${ sws }(${ posQuantPattern }))?` + // background-size
			'(?![^()]*\\))' +
			lookAheadNotClosingParenPattern, 'gi' ),
		bgPositionSingleValueRegExp = new RegExp(
			'(^|\\s|,)' +
			`([-+]?${ numPattern }%)` +
			lookAheadNotClosingParenPattern, 'gi' ),
		bgRepeatRegExp = new RegExp( `(background-repeat${ colon })([A-z-, ]+)` + suffixPattern, 'gi' ),
		bgRepeatValueRegExp = new RegExp( `(?:repeat-[xy]|((?:no-)?repeat|space|round)${ sws }((?:no-)?repeat|space|round))` + lookAheadNotClosingParenPattern, 'gi' ),
		bgSizeRegExp = new RegExp( `(background-size${ colon })([^;{}]+)`, 'gi' ),
		twoQuantsRegExp = new RegExp( `(auto|${ posQuantPattern })(?:${ sws }(auto|${ posQuantPattern }))?`, 'gi' ),
		linearGradientRegExp = new RegExp(
			`((?:repeating-)?linear-gradient\\(${ _ })` +
			`(?:${ anglePattern }(${ comma }))?` +
			`(${ colorStopsPattern + _ }\\))`,
			'gi'
		),
		radialGradientRegExp = new RegExp(
			`((?:repeating-)?radial-gradient\\(${ _ })` +
			`((?:${ _ }(?:(?:closest|farthest)-(?:corner|side)|circle|ellipse|${ posQuantPattern })(?=\\s|,))*)` +
			`(${ ws }at(?:${ ws }(?:${ edgesPattern }|${ quantPattern })){1,4})?` + // positon
			`(${ comma + colorStopsPattern + _ }\\))`,
			'gi'
		),
		borderImageRegExp = new RegExp( `(border-image(?:-slice)?${ colon }[^;}]*?)` +
			`${ signedQuantPattern }(?:(${ ws }(?:fill${ ws })?)${ signedQuantPattern }(?:(${ ws }(?:fill${ ws })?)${ signedQuantPattern }(?:(${ ws }(?:fill${ ws })?)${ signedQuantPattern })?)?)?` +
			`(?:((?:${ ws }fill)?${ slash })(?:${ signedQuantPattern }(?:${ sws + signedQuantPattern }(?:${ sws + signedQuantPattern }(?:${ sws + signedQuantPattern })?)?)?)?` +
				`(?:(${ slash })(?:${ signedQuantPattern }(?:${ sws + signedQuantPattern }(?:${ sws + signedQuantPattern }(?:${ sws + signedQuantPattern })?)?)?)?)?` +
			')?' +
			lookAheadNotClosingParenPattern, 'gi' ),
		borderImageRepeatRegExp = new RegExp( `(border-image(?:-repeat)?${ colon }[^;}]*?)(stretch|repeat|round|space)${ sws }(stretch|repeat|round|space)` + lookAheadNotLetterPattern + lookAheadNotClosingParenPattern, 'gi' ),
		// border-radius: <length or percentage>{1,4} [optional: / <length or percentage>{1,4} ]
		borderRadiusRegExp = new RegExp( `(border-radius${ colon })${ signedQuantPattern }(?:(?:${ sws + signedQuantPattern })(?:${ sws + signedQuantPattern })?(?:${ sws + signedQuantPattern })?)?` +
			`(?:(?:(${ slash })${ signedQuantPattern })(?:${ sws + signedQuantPattern })?(?:${ sws + signedQuantPattern })?(?:${ sws + signedQuantPattern })?)?` + suffixPattern, 'gi' ),
		borderRadiusSingleCornerRegExp = new RegExp( `border-(left|right)-(top|bottom)-radius(?:(${ colon })(${ posQuantPattern })${ sws }(${ posQuantPattern }))?` + lookAheadNotOpenBracePattern + lookAheadNotClosingParenPattern, 'gi' ),
		shadowRegExp = new RegExp( `((?:box|text)-shadow${ colon }|drop-shadow\\(${ _ })` +
			'(' +
				`(?:inset|${ quantPattern }|${ colorPattern })` +
				`(?:(?:${ ws }|${ comma })(?:inset|${ quantPattern }|${ colorPattern }))*` +
			')',
			'gi'
		),
		shadowValueRegExp = new RegExp( `((?:${ colorPattern + ws }(?:inset${ ws })?)?)${ signedQuantPattern + sws + signedQuantPattern }([^,;}]*)`, 'gi' ),
		transformRegExp = new RegExp( `(transform${ colon })([^;{}]+)` + suffixPattern, 'gi' ),
		transformFunctionRegExp = new RegExp( `((?:rotate|translate|skew|scale|matrix)(?:x|y|z|3d)?)(\\(${ _ })([^\\)]*?)(${ _ }\\))`, 'gi' ),
		transformOriginRegExp = new RegExp( `(transform-origin${ colon })` +
			`(?=((?:top|bottom)${ ws + quantPattern }|${ quantPattern + ws }(?:left|right))?)` +
			`(?=((?:left|right)${ ws + quantPattern }|${ quantPattern + ws }(?:top|bottom))?)` +
			`(${ edgesPattern }(?=${ ws + quantPattern })|${ quantPattern })` +
			`(?:${ sws }(${ edgesPattern }|${ quantPattern }))?`, 'gi' ),
		perspectiveOriginRegExp = new RegExp( `(perspective-origin${ colon })([^;{}]+)`, 'gi' ),
		sizeRegExp = new RegExp( '(max-|min-|[^-a-z])(height|width)' + lookAheadNotLetterPattern + lookAheadNotClosingParenPattern + lookAheadNotOpenBracePattern, 'gi' ),
		writingModeRegExp = new RegExp( `(writing-mode${ colon })(tb|bt|rl|lr|horizontal|vertical)-(tb|bt|rl|lr)`, 'gi' ),
		resizeRegExp = new RegExp( `(resize${ colon })(horizontal|vertical)`, 'gi' ),
		xyPropRegExp = new RegExp( '((?:overflow|scroll-snap-(?:points|type)|overscroll-behavior|pan)-)([xy])' + lookAheadNotClosingParenPattern + lookAheadNotOpenBracePattern, 'gi' ),
		mediaQueryRegExp = new RegExp( `(@media${ ws })([^{}]+)(\\{)`, 'gi' ),
		mediaOrientationRegExp = new RegExp( `(orientation${ colon })(landscape|portrait)`, 'gi' ),
		mediaFeatureRegExp = new RegExp( `(width|height|aspect-ratio)(${ colon })(?:(${ posQuantPattern })(?:(${ slash })(${ posQuantPattern }))?)?`, 'gi' ),
		// Angle units and their values for full circles.
		angleMaxes = {
			deg: 360,
			grad: 400,
			rad: Math.PI * 2,
			turn: 1
		};

	/**
	 * Perform text replacements on a string with provided regular expressions
	 * and functions.
	 *
	 * The first captured group bypasses the replacement function and is added
	 * directly to the beginning of the result, and the argument matching the
	 * entire substring similarly bypasses the function.
	 *
	 * This function can be used in one of two ways:
	 * * regexArray can be a RegExp or array of RegExps, which get replaced by fn.
	 * * regexArray can be an array of RegExp-group/function pairs, in arrays,
	 *   which are run through .replace sequentially.
	 *
	 * @example
	 * // returns 'a:B'
	 * replace( 'a:b', /(a:)(b)/, letter => letter.toUpperCase() );
	 *
	 * @example
	 * // returns 'a:B;a:C;'
	 * replace( 'a:b;a:c;', [ /(a:)(b)/, /(a:)(c)/ ], letter => letter.toUpperCase() );
	 *
	 * @example
	 * // returns 'a:B;a:C;d:fe;'
	 * replace( 'a:b;a:c;d:e-f;', [
	 *   [ [ /(a:)(b)/, /(a:)(c)/ ], letter => letter.toUpperCase() ],
	 *   [ /(d:)(e)-(f)/, ( e, f ) => { return f + e; } ]
	 * ] );
	 *
	 * @param {string} string Original string to run the replacements on.
	 * @param {(RegExp|RegExp[]|Array[])} regexArray Regular expression(s) to
	 * replace, or array of RegExp-group/function pairs.
	 *
	 * For a collection of different types of replacements:
	 * @param {RegExp|RegExp[]} regexArray[].0 RegExp(s) to replace.
	 * @param {Function} regexArray[].1 Function to replace the matches of the corresponding RegExp(s).
	 *
	 * To replace with a single function:
	 * @param {Function} [fn] Function to replace the matches of the RegExp(s).
	 *
	 * @return {string}
	 */
	function replace( string, regexArray, fn ) {
		regexArray = Array.isArray( regexArray ) ? regexArray : [ regexArray ];
		if ( regexArray[ 0 ] instanceof RegExp ) {
			return regexArray.reduce( ( acc, regex ) => acc.replace( regex, function ( match, pre ) {
				return pre + fn.apply( null, Array.prototype.slice.call( arguments, 2 ) );
			} ), string );
		} else {
			return regexArray.reduce( ( acc, rSet ) => replace( acc, rSet[ 0 ], rSet[ 1 ] ), string );
		}
	}

	/**
	 * Generates an array containing numeric versions of the inline-start and block-start of the given direction.
	 * The standard top>right>bottom>left order is used, so lr-tb would be [ 3, 0 ], for example.
	 *
	 * @private
	 * @param {string} dir
	 * @return {Array}
	 */
	function orientationArray( dir ) {
		return dir.split( '-' ).map( dir => directions[ dir ] );
	}

	/**
	 * Get the number of digits after the decimal point of a number.
	 *
	 * @private
	 * @param {string|number} value
	 * @return {number}
	 */
	function getPrecision( value ) {
		const valueString = value.toString(),
			decimalIndex = valueString.indexOf( '.' );
		return decimalIndex === -1 ? 0 : valueString.length - decimalIndex - 1;
	}

	/**
	 * Invert the value of a property with a value of the CSS datatype "position".
	 *
	 * @private
	 * @param {string} value
	 * @return {string}
	 */
	function flipPositionValue( value ) {
		var number, precision;
		if ( value.slice( -1 ) === '%' ) {
			number = value.slice( 0, -1 );
			precision = getPrecision( number );
			if ( precision !== 0 ) {
				value = ( 100 - number ).toFixed( precision ) + '%';
			} else {
				value = 100 - number + '%';
			}
		}
		return value;
	}

	/**
	 * Flip the sign of a CSS value, possibly with a unit.
	 *
	 * We can't just negate the value with unary minus due to the units.
	 *
	 * @private
	 * @param {string} value
	 * @return {string}
	 */
	function flipSign( value ) {
		if ( parseFloat( value ) === 0 ) {
			// Don't mangle zeroes
			return value;
		}

		if ( value[ 0 ] === '-' ) {
			return value.slice( 1 );
		}

		return '-' + ( value[ 0 ] === '+' ? value.slice( 1 ) : value );
	}

	/**
	 * Swap horizontal and vertical values for background-repeat, both explicit
	 * and via background shorthand.
	 *
	 * @private
	 * @param {string} match
	 * @param {string} x Horizontal axis repeat value
	 * @param {string} space
	 * @param {string} y Vertical axis repeat value
	 * @return {string}
	 */
	function backgroundTwoPointSwap( match, x, space, y ) {
		// x/y will only be absent on background-repeat: repeat-[xy]; or background: [...] repeat-[xy] [...];
		return y ? y + space + x : ( match.toLowerCase() === 'repeat-x' ? 'repeat-y' : 'repeat-x' );
	}

	/**
	 * @private
	 * @param {number} dir
	 * @param {string} X
	 * @param {string} Y
	 * @return {string}
	 */
	function flipXYPositions( dir, X, Y ) {
		switch ( dir ) {
			case 0:
				return flipSign( Y );
			case 1:
				return X;
			case 2:
				return Y;
			case 3:
				return flipSign( X );
		}
	}

	/**
	 * Relocate the various values in four-part notation rules, like padding: 1px 2px 3px 4px;
	 *
	 * @private
	 * @param {Object} pointMap Mapping of which entries go where. Either map for sides or cornersMap for corners.
	 * @param {Array} array Alternating value strings and spaces. (Eg [ '1px', ' ', '2px', ' ', ... ])
	 * @param {boolean} turned Whether transformation is such that a three-point value would become four-point.
	 * @return {string}
	 */
	function processFourNotationArray( pointMap, array, turned ) {
		return array.map( function fourNotationMap( val, index, all ) {
			var actualIndex;
			if ( index & 1 ) {
				// Spaces between values.
				return val ||
					// If turned so that a fourth value is needed, add a space to fit the duplicate final value.
					( ( index === 5 && turned && all[ 4 ] ) ? ' ' : '' );
			} else {
				if ( !val ) {
					return ( index === 6 && turned && all[ 4 ] ) ? all[ pointMap[ index / 2 ] * 2 ] : '';
				} else {
					// "Actual" index, skipping spaces.
					actualIndex = ( index / 2 );
					return (
						all[ pointMap[ actualIndex ] * 2 ] ||
						// There's less than four values, and the one this would normally be
						// swapped with doesn't exist. Try an earlier equivalent one.
						all[ ( pointMap[ actualIndex ] * 2 ) ^ 4 ] ||
						// There's literally only one value in the list. Use that.
						all[ 0 ]
					);
				}
			}
		} ).join( '' );
	}

	return {
		/**
		 * Transform a stylesheet to from one direction to another.
		 *
		 * @param {string} css Stylesheet to transform
		 * @param {Object} options Options
		 * @param {boolean} [options.transformDirInUrl=false] Transform directions in URLs (e.g. 'ltr', 'rtl', 'vertical-lr', 'rl-tb', 'horizontal-inline')
		 * @param {boolean} [options.transformEdgeInUrl=false] Transform edges in URLs (e.g. 'left', 'right', 'top', and 'bottom')
		 * @param {string} [options.sourceDir='lr-tb'] The source direction and writing mode
		 * @param {string} [options.targetDir='rl-tb'] The target direction and writing mode
		 * @return {string} Transformed stylesheet
		 */
		transform: function ( css, options ) {
			var source,
				target,
				map,
				cornersMap,
				dirFlipped,
				quarterTurned,
				cornersFlipped,
				reflected,
				flipX,
				flipY,
				noFlipSingleTokenizer,
				noFlipClassTokenizer,
				commentTokenizer,
				calcTokenizer,
				swapText,
				// Default values
				sourceDir = options.sourceDir || 'lr-tb',
				targetDir = options.targetDir || 'rl-tb';

			if ( sourceDir === targetDir ) {
				return css;
			}

			source = orientationArray( sourceDir );
			target = orientationArray( targetDir );
			map = {};
			cornersMap = {};
			// Determine if direction (ltr/rtl) is flipped.
			dirFlipped = ( ( source[ 0 ] ^ target[ 0 ] ) % 3 ) !== 0;
			// Determine if rotated 90deg or 270deg, with or without mirroring.
			// That is, whether height and width are swapped.
			quarterTurned = ( source[ 0 ] & 1 ) !== ( target[ 0 ] & 1 );
			// Determine whether corner axes (ne/sw, nw/se) remain constant.
			cornersFlipped = ( source[ 0 ] + source[ 1 ] ) % 3 !== ( target[ 0 ] + target[ 1 ] ) % 3;
			// Actually flipped, as opposed to just rotated.
			reflected = ( ( source[ 0 ] - source[ 1 ] ) & 3 ) !== ( ( target[ 0 ] - target[ 1 ] ) & 3 );
			// Tokenizers
			noFlipSingleTokenizer = new Tokenizer( noFlipSingleRegExp, noFlipSingleToken );
			noFlipClassTokenizer = new Tokenizer( noFlipClassRegExp, noFlipClassToken );
			commentTokenizer = new Tokenizer( commentRegExp, commentToken );

			for ( let i = 0; i < 4; i++ ) {
				// Which sides are moved where, eg map[ 1 ] = 3 means that the right is the old left.
				map[ target[ i & 1 ] ^ ( i & 2 ) ] = source[ i & 1 ] ^ ( i & 2 );
				// Which corners are moved where, eg cornersMap[ 0 ] = 1 means that the top-left is the old top-right.
				cornersMap[ target[ i & 1 ] ^ ( i & 2 ) ] = ( ( ( source[ i & 1 ] ^ ( i & 2 ) ) + reflected ) & 3 );
			}

			// Whether X/Y axes should be flipped (pre-rotation, if applicable).
			flipX = ( map[ 3 ] === 1 || map[ 0 ] === 1 );
			flipY = ( map[ 2 ] === 0 || map[ 1 ] === 0 );

			swapText = ( function () {
				var textChanges = {},
					rotateMap;

				for ( let i = 0; i < 4; i++ ) {
					textChanges[ sides[ map[ i ] ] ] = sides[ i ]; // "left", "top", etc
					textChanges[ cursors[ map[ i ] ] ] = cursors[ i ]; // "n[-resize]", etc.
					textChanges[ wmDirs[ map[ i ] ] ] = wmDirs[ i ]; // "tb", "lr", etc.
				}

				if ( quarterTurned ) {
					// Text fragments to be swapped when changing from horizontal writing
					// to vertical, or vice versa.
					rotateMap = {
						// Specific properties
						height: 'width',
						'background-position-x': 'background-position-y',
						// Resize, writing modes, and URLs.
						horizontal: 'vertical',
						// Cursors
						text: 'vertical-text',
						'ns-resize': 'ew-resize',
						'row-resize': 'col-resize',
						// Media orientation
						portrait: 'landscape',
						// Overflow-*, scroll snap properties
						x: 'y',
						// Transforms
						scalex: 'scaley',
						skewx: 'skewy',
						rotatex: 'rotatey',
						translatex: 'translatey'
					};

					Object.keys( rotateMap ).forEach( function ( key ) {
						textChanges[ key ] = rotateMap[ key ];
						textChanges[ rotateMap[ key ] ] = key;
					} );
				}

				if ( dirFlipped ) {
					textChanges.ltr = 'rtl';
					textChanges.rtl = 'ltr';
				}

				if ( cornersFlipped ) {
					textChanges[ 'nesw-resize' ] = 'nwse-resize';
					textChanges[ 'nwse-resize' ] = 'nesw-resize';
				}

				/**
				 * Transform certain property names and values, ex "width" -> "height".
				 *
				 * @param {string} text Text to be transformed.
				 * @return {string}
				 */
				return function swapText( text ) {
					// CSS property names are case insensitive.
					const lcText = text && text.toLowerCase();
					return textChanges[ lcText ] || text || '';
				};
			}() );

			function positionFormat( val ) {
				return replace( val, positionValuesRegExp, ( xPos, xEdge, space1, yPos, yEdge, slash, sizeX, sizeSpace, sizeY ) => {
					// Edge offsets are not supported in IE8, so don't switch to it unless it was already being used.
					var position;
					if ( !xEdge || !yEdge ) {
						// There are quantities that are not edge-offsets.
						if ( !yPos ) {
							// Only one value given.
							if ( quarterTurned && !xEdge ) {
								// Only the horizontal value was provided, and we're converting it to vertical.
								// Default new horizontal to "center".
								yPos = 'center';
								space1 = ' ';
							} else {
								yPos = space1 = '';
							}
						} else {
							if ( !yEdge && ( map[ 2 ] === 0 || map[ 1 ] === 0 ) ) {
								yPos = flipPositionValue( yPos );
							}
						}
						if ( !xEdge && ( map[ 3 ] === 1 || map[ 0 ] === 1 ) ) {
							xPos = flipPositionValue( xPos );
						}
					}

					position = quarterTurned ?
						yPos + space1 + xPos :
						xPos + space1 + yPos;

					return position +
						( sizeY ?
							slash + ( quarterTurned ?
								// Swap background-size shorthand values.
								sizeY + sizeSpace + sizeX :
								sizeX + sizeSpace + sizeY ) :
							'' );
				} );
			}

			// Tokenize

			// calc() is more complicated than comments, because they can be
			// nested, which can't be handled by normal regular expressions.
			calcTokenizer = ( function ( token ) {
				const matches = [];

				return {
					tokenize: function ( css ) {
						const regex = /(?=((?:-moz-|-webkit-)?calc\())/gi;

						for ( let lastCalc; ( lastCalc = regex.exec( css ) ); ) {
							let calcIndex = lastCalc.index,
								lastBracket = calcIndex + lastCalc[ 1 ].length;
							for ( let depth = 1; depth > 0; ) {
								let nextOpen = css.indexOf( '(', lastBracket ),
									nextClose = css.indexOf( ')', lastBracket );
								if ( nextOpen !== -1 && nextOpen < nextClose ) {
									lastBracket = nextOpen + 1;
									depth++;
								} else if ( nextClose !== -1 ) {
									lastBracket = nextClose + 1;
									depth--;
								} else {
									// Unclosed calc(). Abort.
									//
									// According to both the spec and current practice, this is
									// basically supposed to consume the entire rest of the CSS file.
									// However, to minimize damage in case this is a parsing error,
									// we're just going to tokenize the calc keyword itself.
									lastBracket = css.length;
									break;
								}
							}
							css = css.substring( 0, calcIndex ) +
								// Tokenize the calc(), recording it's index in the token.
								// This is necessary because calcs may be moved around.
								token.replace( /\$1/, matches.push( css.substring( calcIndex, lastBracket ) ) - 1 ) +
								css.substring( lastBracket );
						}
						return css;
					},
					detokenize: function ( str ) {
						const regex = new RegExp( '(-?)' + token.replace( /\$1/, '(\\d+)' ), 'g' );
						return str.replace( regex, function ( match, negative, index ) {
							let calc = matches[ index ];
							if ( negative ) {
								// Flip all values with units.
								calc = calc.replace( quantPlainUnitRegex, flipSign );
							}
							return calc;
						} );
					}
				};
			}( calcToken ) );

			css = calcTokenizer.tokenize(
				commentTokenizer.tokenize(
					noFlipClassTokenizer.tokenize(
						noFlipSingleTokenizer.tokenize(
							// We wrap tokens in ` , not ~ like the original implementation does.
							// This was done because ` is not a legal character in CSS and can only
							// occur in URLs, where we escape it to %60 before inserting our tokens.
							css.replace( '`', '%60' )
						)
					)
				)
			);

			// Transform URLs
			if ( options.transformDirInUrl ) {
				// Transform directions and writing-modes in background URLs.
				css = replace( css, dirInUrlRegExp, dir => {
					// Valid directions:
					//   ltr, rtl, tb-lr, tb-rl, lr-tb, lr-bt, rl-tb, rl-bt, bt-lr, bt-rl
					//   horizontal-tb, horizontal-bt, vertical-lr, vertical-rl,
					//   tb-inline, bt-inline, lr-inline, rl-inline, horizontal-inline, vertical-inline,
					return dir.split( '-' ).map( swapText ).join( '-' );
				} );
			}
			if ( options.transformEdgeInUrl ) {
				// Replace 'left', 'top', 'right', and 'bottom' with the appropriate side in background URLs
				css = replace( css, edgeInUrlRegExp, swapText );
			}

			// Transform rules
			css = replace( css, [
				// Flip rules like left: , padding-right: , etc.
				[ sidesRegExp, ( dontRotate, suppressChange, side ) =>
					dontRotate ?
						// Dealing with a property with non-standard behaviour regarding sides.
						// For example:
						// * caption-side is writing-mode-relative, and shouldn't ever be
						//   rotated or flipped. suppressChange = true
						// * float: left/right works by direction, not writing mode. It can
						//   be flipped between left and right, but never rotated.
						dontRotate +
							( !suppressChange && dirFlipped && ( { right: 'left', left: 'right' }[ side.toLowerCase() ] ) || side ) :
						// Normal sides. Rotate/flip as applicable.
						swapText( side )
				],
				// Transform North/East/South/West in rules like cursor: nw-resize;
				[ cursorRegExp, ( ns, ew, otherCursor ) =>
					otherCursor ?
						// cursor: ns/ew/nesw/nwse/row/col-resize/text/vertical-text
						swapText( otherCursor ) :
						// cursor: n/e/s/w/ne/nw/se/sw-resize
						swapText( quarterTurned ? ew : ns ) +
						swapText( quarterTurned ? ns : ew ) + '-resize'
				],
				// Border radius
				[ borderRadiusRegExp, function () {
					const preSlash = processFourNotationArray( cornersMap, [].slice.call( arguments, 0, 7 ), cornersFlipped ),
						postSlash = processFourNotationArray( cornersMap, [].slice.call( arguments, 8, 15 ), cornersFlipped );
					return ( quarterTurned ? postSlash + ( arguments[ 7 ] || '' ) + preSlash : preSlash + ( arguments[ 7 ] || '' ) + postSlash ) +
						( arguments[ 15 ] || '' );
				} ],
				// Shadows
				[ shadowRegExp, value =>
					replace( value, shadowValueRegExp, ( X, space, Y, end ) =>
						flipXYPositions( map[ 1 ], X, Y ) + space + flipXYPositions( map[ 2 ], X, Y ) + end
					)
				],
				// Switch around parts in two-, three-, and four-part notation rules
				// like padding: 1px 2px 3px 4px;
				[ fourNotationGroups, function ( q1, s1, q2, s2, q3, s3, q4, s4 ) {
					return processFourNotationArray( map, [].slice.call( arguments, 0, 7 ), quarterTurned ) + s4;
				} ],
				// Background gradients.
				[ linearGradientRegExp, ( angleQuant, angleUnitText, space, post ) => {
					var angleQuantFloat = parseFloat( angleQuant || 180 ),
						angleUnit = angleUnitText || 'deg',
						angleText = '',
						max = angleMaxes[ angleUnit ],
						addedRotation = map[ 0 ] * max / 4,
						precision;

					if ( angleQuantFloat === 0 && angleUnitText ) {
						// Invalid angle.
						return angleQuant + angleUnitText + space + post;
					}

					precision = Math.max( getPrecision( angleQuant || '0' ), getPrecision( addedRotation ) );
					angleQuant = ( max + ( reflected ? 1 : -1 ) * ( addedRotation - angleQuantFloat ) ) % max;

					// If no angle given, and no necessary angle change, leave unchanged.
					if ( space || angleQuant !== 180 ) {
						angleText = angleQuant.toFixed( precision ) + ( angleQuant === 0 ? angleUnitText : angleUnit ) + ( space || ', ' );
					}

					return angleText + post;
				} ],
				[ radialGradientRegExp, function ( shape, position, post ) {

					if ( shape.indexOf( 'ellipse' ) !== -1 && quarterTurned ) {
						// Swap X and Y sizes.
						shape = shape.replace( twoQuantsRegExp, '$3$2$1' );
					}

					position = position ? positionFormat( position ) : '';

					return shape + position + post;
				} ],
				// Border images
				[ borderImageRegExp, function () {
					return (
						// border-image-slice
						processFourNotationArray( map, [].slice.call( arguments, 0, 7 ), quarterTurned ) + ( arguments[ 7 ] || '' ) +
						// border-image-width
						processFourNotationArray( map, [].slice.call( arguments, 8, 15 ), quarterTurned ) + ( arguments[ 15 ] || '' ) +
						// border-image-outset
						processFourNotationArray( map, [].slice.call( arguments, 16, 23 ), quarterTurned )
					);
				} ],
				// Transforms
				[ transformRegExp, function ( value, suffix ) {
					return value.replace( transformFunctionRegExp,
						function ( match, fnName, start, value, end ) {
							var lcFnName = fnName.toLowerCase(),
								newProp = swapText( fnName ),
								fallbackFirstArg,
								isR3d,
								vals = [],
								separators = [],
								newVals;

							value.split( new RegExp( '(' + comma + ')', 'g' ) ).forEach( function ( text, index ) {
								( index % 2 === 1 ? separators : vals ).push( text );
							} );

							switch ( lcFnName ) {
								case 'rotate3d':
									isR3d = true;
									if ( vals.length !== 4 ) {
										// Wrong number of arguments, leave it alone.
										return match;
									}
									if ( reflected ) {
										vals[ 2 ] = flipSign( vals[ 2 ] );
									}
									/* falls through */
								case 'translate':
								case 'translate3d':
								case 'skew':
								case 'skewx':
								case 'skewy':
									// Flip/swap first two args
									fallbackFirstArg = '0';

									if ( lcFnName.indexOf( 'skew' ) === 0 ) {
										// skew, skewx, skewy.
										if ( flipX ^ flipY ) {
											vals[ 0 ] = flipSign( vals[ 0 ] );
											if ( lcFnName === 'skew' ) {
												if ( vals[ 1 ] ) {
													vals[ 1 ] = flipSign( vals[ 1 ] );
												}
											}
										}
										if ( lcFnName !== 'skew' ) {
											// skewx and skewy have only one argument, no need to
											// continue on to the swap of vals[ 0 ] and vals[ 1 ].
											break;
										}
									} else {
										// rotate3d, translate, and translate3d.
										// Order is backward for rotate3d.
										// [ 0 ] is _around_ the X axis, meaning only relevant when
										// the Y axis changes, [ 1 ] is around Y, thus only flipped
										// when flipX === true. Also, r3d goes around X and Y in
										// different directions, so quarterTurned requires another
										// flip back sometimes.
										if ( isR3d ? flipY ^ quarterTurned : flipX ) {
											vals[ 0 ] = flipSign( vals[ 0 ] );
										}
										if ( isR3d ? flipX ^ quarterTurned : flipY && vals[ 1 ] ) {
											vals[ 1 ] = flipSign( vals[ 1 ] );
										}
									}

									/* falls through */
								case 'scale':
								case 'scale3d':
									// Just swap first two args

									// scale( 1 ) is null, as opposed to translate( 0 )
									fallbackFirstArg = fallbackFirstArg || '1';

									if ( quarterTurned ) {
										vals[ 0 ] = [ vals[ 1 ], vals[ 1 ] = vals[ 0 ] ][ 0 ] || fallbackFirstArg;
									}
									break;
								case 'rotate':
								case 'rotatez':
									// Just flip, if reflected === true
									if ( reflected === true ) {
										vals[ 0 ] = flipSign( vals[ 0 ] );
									}
									break;
								case 'translatex':
								case 'translatey':
									if ( lcFnName.slice( -1 ) === 'x' ? flipX : flipY ) {
										vals[ 0 ] = flipSign( vals[ 0 ] );
									}
									break;
								case 'rotatex':
								case 'rotatey':
									if ( ( ( lcFnName.slice( -1 ) === 'x' ) ? flipY : flipX ) ^ quarterTurned ) {
										vals[ 0 ] = flipSign( vals[ 0 ] );
									}
									break;
								case 'matrix':
									newVals = vals.slice( 0 );
									// Flip translation.
									if ( flipX ) {
										newVals[ 4 ] = flipSign( vals[ 4 ] );
									}
									if ( flipY ) {
										newVals[ 5 ] = flipSign( vals[ 5 ] );
									}
									if ( quarterTurned ) {
										// Swap scale dimensions
										newVals[ 0 ] = vals[ 3 ];
										newVals[ 3 ] = vals[ 0 ];
										// Swap skew values.
										newVals[ 1 ] = vals[ 2 ];
										newVals[ 2 ] = vals[ 1 ];
										// Swap translate directions.
										newVals[ 4 ] = [ newVals[ 5 ], newVals[ 5 ] = newVals[ 4 ] ][ 0 ];
									}
									// Flip skew values.
									if ( flipX ^ flipY ) {
										newVals[ 1 ] = flipSign( newVals[ 1 ] );
										newVals[ 2 ] = flipSign( newVals[ 2 ] );
									}

									vals = newVals;
									break;
							}

							return newProp + start + vals.reduce( function ( acc, val, index ) {
								// Reassemble the function, interspersing the original separators.
								return acc + ( separators[ index - 1 ] || ', ' ) + val;
							} ) + end;
						}
					) + suffix;
				} ],
				[ transformOriginRegExp, function ( reverseOrder, reverseOrderQT, v1, space, v2 ) {
					var isReverseOrder = quarterTurned ? reverseOrderQT : reverseOrder,
						x = isReverseOrder ? v2 : v1,
						y = isReverseOrder ? v1 : v2;

					if ( flipX ) {
						x = flipPositionValue( x );
					}
					if ( flipY && y ) {
						y = flipPositionValue( y );
					}
					if ( quarterTurned ) {
						let temp = y;
						y = x;
						x = temp;
					}

					return ( isReverseOrder ?
						( y ? y + space : 'center ' ) + x :
						( x ? x + ( y ? space + y : '' ) : 'center ' + y )
					);
				} ],
				[ perspectiveOriginRegExp, positionFormat ],
				// Writing mode
				[ writingModeRegExp, ( inline, block ) =>
					// Inline direction   /    Block direction
					swapText( inline ) + '-' + swapText( block )
				]
			] );

			// Transform background positions, and shorthands for background-size and background-repeat.
			css = css
				.replace( bgRegExp, function ( match, prop, space, val ) {

					if ( quarterTurned ) {
						val = val.replace( bgRepeatValueRegExp, backgroundTwoPointSwap );
					}

					return swapText( prop ) + space + positionFormat( val );
				} )
				// Background-position-x and background-position-y
				.replace( bgXYRegExp, function ( match, prop, space, val, suffix ) {
					return (
						// When switching between horizontal and vertical writing, replace
						// background-position-x with -y and vice versa.
						swapText( prop ) +
						// If there's a value, transform it. (No value if in transition statement.)
						( space ? space + replace( val, bgPositionSingleValueRegExp, position => {
							if ( prop.toLowerCase() === 'background-position-x' ?
								flipX :
								flipY
							) {
								position = flipPositionValue( position );
							}

							return position;
						} ) + suffix : '' )
					);
				} );

			if ( dirFlipped ) {
				// Replace direction: ltr; with direction: rtl; and vice versa.
				css = replace( css, directionRegExp, swapText );
			}

			if ( quarterTurned ) {
				css = replace( css, [
					[ [ resizeRegExp, xyPropRegExp, sizeRegExp ], swapText ],
					[ bgRepeatRegExp, ( value, suffix ) =>
						value.replace( bgRepeatValueRegExp, backgroundTwoPointSwap ) + suffix
					],
					[ bgSizeRegExp, value =>
						value.replace( twoQuantsRegExp, ( match, x, space, y ) =>
							match.toLowerCase() === 'auto' ? match : ( y ? y + space : 'auto ' ) + x
						)
					],
					[ mediaQueryRegExp, ( value, suffix ) =>
						replace( value, mediaOrientationRegExp, swapText )
							.replace( mediaFeatureRegExp, ( match, prop, space, value, slash, vPixels ) =>
								swapText( prop ) + space +
									( slash ? vPixels + slash + value : value )
							) + suffix
					]
				] );

				css = css
					.replace( borderImageRepeatRegExp, '$1$4$3$2' )
					.replace( borderRadiusSingleCornerRegExp, 'border-$2-$1-radius$3$6$5$4' );
			}

			// Detokenize
			css = noFlipSingleTokenizer.detokenize(
				noFlipClassTokenizer.detokenize(
					commentTokenizer.detokenize(
						calcTokenizer.detokenize( css )
					)
				)
			);

			return css;
		}
	};
}

/* Initialization */

cssjanus = new CSSJanus();

/* Exports */

/**
 * Transform a stylesheet to from one direction to another.
 *
 * This function is a static wrapper around the transform method of an instance of CSSJanus.
 *
 * @param {string} css Stylesheet to transform
 * @param {Object|boolean} [options] Options object, or transformDirInUrl option (back-compat)
 * @param {boolean} [options.transformDirInUrl=false] Transform directions in URLs (e.g. 'ltr', 'rtl', 'vertical-lr', 'rl-tb', 'horizontal-inline')
 * @param {boolean} [options.transformEdgeInUrl=false] Transform edges in URLs (e.g. 'left', 'right','top', 'bottom')
 * @param {string} [options.sourceDir='lr-tb'] The source direction and writing mode
 * @param {string} [options.targetDir='rl-tb'] The target direction and writing mode
 * @param {boolean} [transformEdgeInUrl] Back-compat parameter
 * @return {string} Transformed stylesheet
 */
exports.transform = function ( css, options, transformEdgeInUrl ) {
	let norm;
	if ( typeof options === 'object' ) {
		norm = options;
	} else {
		norm = {};
		if ( typeof options === 'boolean' ) {
			norm.transformDirInUrl = options;
		}
		if ( typeof transformEdgeInUrl === 'boolean' ) {
			norm.transformEdgeInUrl = transformEdgeInUrl;
		}
	}
	return cssjanus.transform( css, norm );
};
