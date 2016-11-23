import {CryptoHelper} from './crypto';
import {DynamicConfiguration} from './../dynamicConfiguration';
import {VulcainLogger} from './../log/vulcainLogger';
import * as moment from 'moment';
import * as fs from 'fs';
import {VulcainManifest} from './../dependencies/annotations';
import {Conventions} from './../../utils/conventions';
import {IDynamicProperty} from '../dynamicProperty';

/**
 * Static class providing service helper methods
 *
 * @export
 * @class System
 */
export class System {
    static _vulcainServer: string;
    static _vulcainToken: string;
    private static _config;
    private static logger: VulcainLogger;
    private static _environment: string;
    private static _serviceName: string;
    private static _serviceVersion: string;
    private static _domainName: string;
    private static crypter: CryptoHelper;
    private static isLocal: boolean;
    private static isTest: boolean;
    private static _manifest: VulcainManifest;

    static defaultDomainName: string;

    /**
     * Get the application manifest when the application runs in developement mode
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    public static get manifest() {
        if (!System._manifest)
            System._manifest = new VulcainManifest();
        return System._manifest;
    }

    /**
     * UTC date as string.
     *
     * @static
     * @returns
     *
     * @memberOf System
     */
    static nowAsString() {
        return moment.utc().format();
    }

    /**
     * Calculate a diff with a date from now in seconds
     *
     * @static
     * @param {string} date in utc string format
     * @returns
     *
     * @memberOf System
     */
    static diffFromNow(date: string) {
        return moment.utc().diff(moment(date), "second");
    }

    /**
     * Acces to logger
     *
     * @static
     *
     * @memberOf System
     */
    static get log() {
        if (!System.logger)
            System.logger = new VulcainLogger();
        return System.logger;
    }

    /**
     * Check if the service is running in local mode (on developper desktop)
     * by checking if a '.vulcain' file exists in the working directory
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    static get isDevelopment() {
        if (System.isLocal === undefined) {
            System.isLocal = false;
            try {
                if (fs.existsSync(Conventions.instance.vulcainFileName)) {
                    System.isLocal = true;
                    this.loadVulcainLocalConfig();
                    if (System.isLocal) {
                        System.log.info(null, "Running in development mode");
                    }
                }
            }
            catch (e) {/*ignore*/
            }
        }
        return System.isLocal;
    }

    /**
     * Check if the current service is running in a test environnement (VULCAIN_TEST=true)
     *
     * @static
     * @returns
     *
     * @memberOf System
     */
    static get isTestEnvironnment() {
        if (System.isTest === undefined) {
            System.isTest = System.isDevelopment || process.env[Conventions.instance.ENV_VULCAIN_TEST] === "true";
            if (!System.isDevelopment && System.isTest) {
                System.log.info(null, "Running in test mode");
            }
        }
        return System.isTest;
    }

    private static loadVulcainLocalConfig() {
        try {
            let data = fs.readFileSync(Conventions.instance.vulcainFileName, "utf8");
            if (data) {
                System._config = JSON.parse(data);
                if (System._config.isDevelopment === false) {// forced value
                    System.isLocal = false;
                    System.isTest = true;
                }
            }
        }
        catch (e) {
            System.log.error(null, e, "Error when reading local configuration from .vulcain file.");
        }
    }

    /**
     * Resolve un alias (configuration key shared/$alternates/name-version)
     *
     * @param {string} name
     * @param {string} [version]
     * @returns null if no alias exists
     *
     * @memberOf System
     */
    static resolveAlias(name: string, version?: string) {
        // Try to find an alternate uri
        if (System._config && System._config.alias) {
            let alias = System._config.alias[name];
            if (alias) {
                if (typeof alias === "string") {
                    return alias;
                }
                return alias[version];
            }
        }

        // Consul = shared/$alternates/serviceName-version
        let propertyName = '$alternates.' + name;
        if (version)
            propertyName = propertyName + "-" + version;

        let prop = DynamicConfiguration.getProperty<any>(propertyName);
        return prop && <string>prop.value;
    }

    /**
     * Get current environment
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    static get environment() {
        if (!System._environment) {
            let env = process.env[Conventions.instance.ENV_VULCAIN_ENV];
            if (env)
                System._environment = env;
            else
                throw new Error("Environment variable " + Conventions.instance.ENV_VULCAIN_ENV + " is required");
        }
        return System._environment;
    }

    /**
     * Get vulcain server used for getting configurations
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    static get vulcainServer() {
        if (!System._vulcainServer) {
            let env = process.env[Conventions.instance.ENV_VULCAIN_SERVER];
            System._vulcainServer = env || Conventions.instance.defaultVulcainServerName; // for dev
        }
        return System._vulcainServer;
    }

    /**
     * Get token for getting properties (must have configurations:read scope)
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    static get vulcainToken() {
        if (System._vulcainToken === undefined) {
            System._vulcainToken = process.env[Conventions.instance.ENV_VULCAIN_TOKEN];
        }
        return System._vulcainToken;
    }

    /**
     * Get service name
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    static get serviceName() {
        if (!System._serviceName) {
            let env = process.env[Conventions.instance.ENV_SERVICE_NAME];
            if (env)
                System._serviceName = env;
            else
                return null;
        }
        return System._serviceName;
    }

    /**
     * Get service version
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    static get serviceVersion() {
        if (!System._serviceVersion) {
            let env = process.env[Conventions.instance.ENV_SERVICE_VERSION];
            if (env)
                System._serviceVersion = env;
            else
                return null;
        }
        return System._serviceVersion;
    }

    /**
     * Get current domain name
     *
     * @readonly
     * @static
     *
     * @memberOf System
     */
    static get domainName() {
        if (!System._domainName) {
            let env = process.env[Conventions.instance.ENV_VULCAIN_DOMAIN];
            if (env)
                System._domainName = env;
            else
                System._domainName = System.defaultDomainName;
        }
        return System._domainName;
    }

    private static get crypto() {
        if (!System.crypter) {
            System.crypter = new CryptoHelper();
        }
        return System.crypter;
    }

    /**
     * Encrypt a value
     *
     * @static
     * @param {any} value
     * @returns {string}
     *
     * @memberOf System
     */
    static encrypt(value): string {
        return System.crypto.encrypt(value);
    }

    /**
     * Decrypt a value
     *
     * @static
     * @param {string} value
     * @returns
     *
     * @memberOf System
     */
    static decrypt(value: string) {
        return System.crypto.decrypt(value);
    }

    /**
     * create a shared property
     * @param name
     * @param defaultValue
     * @returns {IDynamicProperty<T>}
     */
    public static createSharedConfigurationProperty<T>(name: string, schema: string, defaultValue?: T): IDynamicProperty<T> {
        if (defaultValue === undefined)
            defaultValue = process.env[name.toUpperCase().replace('.', '_')];

        if (!defaultValue && !schema)
            throw new Error("Schema is required if defaultValue is null");

        System.manifest.configurations[name] = schema || typeof defaultValue || "any";
        return DynamicConfiguration.asChainedProperty<T>(
            defaultValue,
            System.domainName + "." + name,
            name);
    }

    /**
     * create a new chained property for the current service. Properties chain is: service.version.name->service.name->team.namespace->name
     * @param name property name
     * @param defaultValue
     * @returns {IDynamicProperty<T>}
     */
    public static createServiceConfigurationProperty<T>(name: string, schema: string, defaultValue?: T) {
        if (defaultValue === undefined)
            defaultValue = process.env[name.toUpperCase().replace('.', '_')];

        if (!defaultValue && !schema)
            throw new Error("Schema is required if defaultValue is null");

        System.manifest.configurations[name] = schema || typeof defaultValue || "any";
        return DynamicConfiguration.asChainedProperty<T>(
            defaultValue,
            System.serviceName + "." + System.serviceVersion + "." + name,
            System.serviceName + "." + name,
            System.domainName + "." + name,
            name);
    }


    /**
     * create an url from segments
     * Segments of type string are concatened to provide the path
     * Segments of type object are appending in the query string
     * Null segments are ignored.
     * @protected
     * @param {string} base url
     * @param {(...Array<string|any>)} urlSegments
     * @returns an url
     */
    static createUrl(baseurl: string, ...urlSegments: Array<string | any>) {

        if (urlSegments) {
            if (!baseurl.includes("?") && baseurl[baseurl.length - 1] !== "/")
                baseurl += "/";

            if (baseurl.includes("?")) {
                urlSegments.forEach((s: any) => {
                    if (typeof s === 'string') {
                        throw new Error('You can\'t have a path on your url after a query string');
                    }
                });

            } else {
                baseurl += urlSegments.filter((s: any) => typeof s === 'string').map((s: string) => encodeURIComponent(s)).join('/');
            }


            var query = urlSegments.filter((s: any) => typeof s !== 'string');

            if (query.length) {
                var sep = baseurl.includes("?") ? "&" : '?';
                query.forEach((obj: any) => {
                    for (var p in obj) {
                        if (!obj.hasOwnProperty(p)) {
                            continue;
                        }
                        if (obj[p]) {
                            baseurl = baseurl.concat(sep, p, '=', encodeURIComponent(obj[p]));
                            sep = '&';
                        }
                    }
                });
            }
            return baseurl;
        } else {
            return baseurl;
        }
    }
}
