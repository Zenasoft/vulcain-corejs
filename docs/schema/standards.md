# Standards

### List properties type for model validation
Use[validator][validator-link]node module. 
 

| Type   |      Description      |  Validator function |
|----------|:-------------:|------:|
| alphanumeric | Validate alphanumeric value. |isAlpha(str [, locale])
| arrayOf | |
|  boolean| Check boolean value) | |
|date-iso8601| check if the string is a valid [ISO 8601 date][wiki-dateiso].|isISO8601(str)
| email|  | | isEmail
| enum | |
|integer||
|length||
|number||
|pattern| It's a RegExp test| 
|range |  Value must be a number between min and max | 
| string | 
| uid| 
| url | | isURL(val)|



[validator-link]:(https://github.com/chriso/validator.js) 
[wiki-dateiso]:(https://en.wikipedia.org/wiki/ISO_8601)
