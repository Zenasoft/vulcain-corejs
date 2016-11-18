const uuid = require('node-uuid');
const validator = require('validator');

export let standards = {
    "$ref": {
        $cardinality: "one",
        $item: null,
        messages: [
            "Collection is not allowed for the reference '{$propertyName}' with cardinality = one.",
            "Reference '{$propertyName}' with cardinality = many must contains an array.",
            "Reference element for property '{$propertyName}' must be of type {$item}."
        ],
        validate: function (val) {
            if (this.$cardinality !== "one" && this.$cardinality !== "many")
                throw new Error("Incorrect cardinality. Allowed values are 'one' or 'many'");
            if (this.$cardinality === "one") {
                if (Array.isArray(val)) return this.messages[0];
                if (this.$item && val.__schema && val.__schema !== this.$item) return this.messages[2];
                return;
            }
            if (this.$cardinality === "many") {
                if (!Array.isArray(val)) return this.messages[1];
                if (this.$item && val) {
                    let ok = true;
                    val.forEach(v => {
                        if (v.__schema) ok = ok || v.__schema === this.$item;
                    });
                    if (!ok) return this.messages[2];
                }
                return;
            }
        }
    },
    "string": {
        message: "Property '{$propertyName}' must be a string.",
        validate: function (val) {
            if (typeof val !== "string") return this.message;
        }
    },
    "pattern": {
        $pattern: null,
        message: "Property '{$propertyName}' must match the following pattern : {$pattern}",
        validate: function (val) {
            if (this.$pattern && new RegExp(this.$pattern).test(val) === false) return this.message;
        }
    },
    "number": {
        message: "Property '{$propertyName}' must be a number.",
        bind: function (val) {
            if (val === undefined) return val;
            if (/^(\-|\+)?([0-9]+(\.[0-9]+)?)$/.test(val))
                return Number(val);
            return NaN;
        },
        validate: function (val) {
            if ((typeof val !== "number") || isNaN(val)) return this.message;
        }
    },
    "length": {
        type: "string",
        $min: undefined,
        $max: undefined,
        messages: [
            "Property '{$propertyName}' must have at least {$min} characters.",
            "Property '{$propertyName}' must have no more than {$max} characters."
        ],
        validate: function (val) {
            let len = val.length;
            if (this.$min !== undefined) {
                if (len < this.$min) return this.messages[0];
            }
            if (this.$max !== undefined) {
                if (len > this.$max) return this.messages[1];
            }
        }
    },
    "integer": {
        message: "Property '{$propertyName}' must be an integer.",
        bind: function (val) {
            if (val === undefined) return val;
            if (/^(\-|\+)?([0-9]+([0-9]+)?)$/.test(val))
                return Number(val);
            return NaN;
        },
        validate: function (val) {
            if ((typeof val !== "number") || isNaN(val)) return this.message;
        }
    },
    "boolean": {
        message: "Property '{$propertyName}' must be a boolean.",
        bind: function (val) {
            if (val === undefined) return val;
            return (typeof val === "string") ? val === "true" : !!val;
        },
        validate: function (val) {
            if (typeof val !== "boolean") return this.message;
        }
    },
    "enum": {
        type: "string",
        $values: [],
        message: "Invalid property '{$propertyName}'. Must be one of [{$values}].",
        validate: function (val) {
            if (this.$values.indexOf(val) === -1) return this.message;
        }
    },
    uid: {
        type: "string",
        bind: (v) => v || uuid.v1()
    },
    "arrayOf": {
        $item: "string",
        messages: [
            "Invalid value '{$value}' for '{$propertyName}', all values must be of type {$item}.",
            "Invalid value '{$value}' for '{$propertyName}', value must be an array.",
        ],
        validate: function (val) {
            if (!Array.isArray(val)) return this.messages[1];
            let error = false;
            val.forEach(e => {
                if (e && typeof e !== this.$item) error = true;
            });
            if (error) return this.messages[0];
        }
    },
    // Value must be a number between min and max
    range: {
        type: "number",
        $min: 0,
        $max: 1,
        message: "Invalid value '{$value}' for '{$propertyName}', value must be between {$min} and {$max}",
        validate: function (val) {
            if (val < this.min || val > this.max) return this.message;
        }
    },
    email: {
        message: "Property '{$propertyName}' must be an email.",
        validate: function (val) {
            if ((typeof val !== "string")) return this.message;

            if (val === undefined) return this.message;
            if (!validator.isEmail(val))
                return this.message;

        }
    },
    url: {
        message: "Property '{$propertyName}' must be an url.",
        validate: function (val) {
            if ((typeof val !== "string")) return this.message;

            if (val === undefined) return this.message;
            if (!validator.isURL(val))
                return this.message;

        }
    }
};
