import {Injectable, LifeTime} from '../../di/annotations';
import {ITokenService} from '../services';
import {Inject} from '../../di/annotations';
import * as fs from 'fs';
import {Conventions} from '../../utils/conventions';
var jwt = require('jsonwebtoken');

@Injectable( LifeTime.Singleton)
export class TokenService implements ITokenService {

    private issuer:string;
    // https://github.com/auth0/node-jsonwebtoken
    // Certificate file (SHA 256)
    private privateKey:Buffer;
    private secretKey:string;
    // https://github.com/rauchg/ms.js
    private tokenExpiration:string;

    constructor()
    {
        this.issuer= process.env[Conventions.instance.ENV_TOKEN_ISSUER];
        this.tokenExpiration= process.env[Conventions.instance.ENV_TOKEN_EXPIRATION] || "20m";
        this.secretKey = process.env[Conventions.instance.ENV_SECRET_KEY] || "DnQBnCG7*fjEX@Rw5uN^hWR4*AkRVKMeRu2#Ucu^ECUNWrKr";
        let privateKeyPath = process.env[Conventions.instance.ENV_PRIVATE_KEY_PATH];
        if(privateKeyPath && fs.exists( privateKeyPath ))
        {
            this.privateKey = fs.readFileSync( privateKeyPath );
        }
    }

    verifyTokenAsync( jwtToken ) : Promise<any>
    {
        return new Promise( async ( resolve, reject ) =>
        {
            if(!jwtToken)
            {
                reject("You must provided a valid token");
                return;
            }
            let options:any = {"issuer":this.issuer};

            try
            {
                let key = this.privateKey || this.secretKey;
                //options.algorithms=[ALGORITHM];

                jwt.verify( jwtToken, key, options, (err, payload) =>
                {
                    if(err)
                        reject(err);
                    else
                        resolve(payload.value);
                });
            }
            catch(err)
            {
                reject({error:err, message:"Invalid JWT token"});
            }
        } );
    }
}
