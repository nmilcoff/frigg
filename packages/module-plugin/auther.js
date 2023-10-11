// Manages authorization and credential persistence
// Instantiation of an API Class
// Expects input object like this:
// const authDef = {
//     API: class anAPI{},
//     moduleName: 'anAPI', //maybe not required
//     requiredAuthMethods: {
//         // oauth methods, how to handle these being required/not?
//         getToken: async function(params, callbackParams, tokenResponse) {},
//         // required for all Auth methods
//         getEntityDetails: async function(params) {}, //probably calls api method
//         getCredentialDetails: async function(params) {}, // might be same as above
//         apiParamsFromCredential: function(params) {},
//         testAuth: async function() {}, // basic request to testAuth
//     },
//     env: {
//         client_id: process.env.HUBSPOT_CLIENT_ID,
//         client_secret: process.env.HUBSPOT_CLIENT_SECRET,
//         scope: process.env.HUBSPOT_SCOPE,
//         redirect_uri: `${process.env.REDIRECT_URI}/an-api`,
//     }
// };

//TODO:
// 1. Add definition of expected params to API Class (or could just be credential?)
// 2.


const { Delegate } = require('@friggframework/core');

const { get } = require('@friggframework/assertions');

class Auther extends Delegate {
    constructor(params) {
        super(params);
        this.userId = get(params, 'userId', null); // Making this non-required
        const definition = get(params, 'definition');
        Object.assign(this, definition.requiredAuthMethods);
        this.name = definition.moduleName;
        this.apiClass = definition.API;
        this.CredentialModel = definition.Credential;
        this.EntityModel = definition.Entity;
    }

    static async getInstance(params) {
        const instance = new this(params);
        if (params.entityId) {
            instance.entity = await instance.EntityModel.findById(params.entityId);
            instance.credential = await instance.CredentialModel.findById(
                instance.entity.credential
            );
        } else if (params.credentialId) {
            instance.credential = await instance.CredentialModel.findById(
                params.credentialId
            );
        }
        const apiParams = {
            ...params.env,
            delegate: instance,
            ...instance.apiParamsFromCredential(instance.credential),
        };
        instance.api = new instance.apiClass(apiParams);
        return instance;
    }

    getName() {
        return this.name;
    }

    async getEntitiesForUserId(userId) {
        // Only return non-internal fields. Leverages "select" and "options" to non-excepted fields and a pure object.
        const list = await this.Entity.find(
            { user: userId },
            '-dateCreated -dateUpdated -user -credentials -credential -__t -__v',
            { lean: true }
        );
        return list.map((entity) => ({
            id: entity._id,
            type: this.getName(),
            ...entity,
        }));
    }


    async validateAuthorizationRequirements() {
        const requirements = await this.getAuthorizationRequirements();
        let valid = true;
        if (['oauth1', 'oauth2'].includes(requirements.type) && !requirements.url) {
            valid = false;
        }
        return valid;
    }

    async getAuthorizationRequirements(params) {
        // this function must return a dictionary with the following format
        // node only url key is required. Data would be used for Base Authentication
        // let returnData = {
        //     url: "callback url for the data or teh redirect url for login",
        //     type: one of the types defined in modules/Constants.js
        //     data: ["required", "fields", "we", "may", "need"]
        // }
        throw new Error(
            'Authorization requirements method getAuthorizationRequirements() is not defined in the class'
        );
    }

    async testAuth(params) {
        // this function must invoke a method on the API using authentication
        // if it fails, an exception should be thrown
        throw new Error(
            'Authentication test method testAuth() is not defined in the class'
        );
    }

    async processAuthorizationCallback(params) {
        const tokenResponse = await this.getToken(this.api, params);
        const entityDetails = await this.getEntityDetails(
            this.api, params, tokenResponse
        );
        await this.findOrCreateEntity(entityDetails);
        return {
            credential_id: this.credential.id,
            entity_id: this.entity.id,
            type: this.getName(),
        }
    }

    async receiveNotification(notifier, delegateString, object = null) {
        if (delegateString === this.api.DLGT_TOKEN_UPDATE) {
            const credentialDetails = await this.getCredentialDetails(this.api);
            await this.updateOrCreateCredential(credentialDetails);
        }
        else if (delegateString === this.api.DLGT_TOKEN_DEAUTHORIZED) {
            await this.deauthorize();
        }
        else if (delegateString === this.api.DLGT_INVALID_AUTH) {
            await this.markCredentialsInvalid();
        }
    }

    async getEntityOptions() {
        // May not be needed if the callback already creates the entity, such as in situations
        // like HubSpot where the account is determined in the authorization flow.
        // This should only be used in situations such as FreshBooks where the user needs to make
        // an account decision on the front end.
        throw new Error(
            'Entity requirement method getEntityOptions() is not defined in the class'
        );
    }

    async findOrCreateEntity(entityDetails) {
        const identifiers = get(entityDetails, 'identifiers');
        const details = get(entityDetails, 'details');
        const search = await this.EntityModel.find({
            ...identifiers
        });
        if (search.length > 1) {
            throw new Error(
                'Multiple entities found with the same identifiers: ' + JSON.stringify(identifiers)
            );
        }
        else if (search.length === 0) {
            this.entity = await this.EntityModel.create({
                credential: this.credential.id,
                ...details,
                ...identifiers,
            });
        } else if (search.length === 1) {
            this.entity = search[0];
        }
    }

    async updateOrCreateCredential(credentialDetails) {
        const identifiers = get(credentialDetails, 'identifiers');
        const details = get(credentialDetails, 'details');

        if (!this.credential){
            const credentialSearch = await Credential.find({
                ...identifiers
            })
            if (credentialSearch.length > 1) {
                throw new Error(`Multiple credentials found with same identifiers: ${identifiers}`);
            }
            else if (credentialSearch === 1) {
                // found exactly one credential with these identifiers
                this.credential = credentialSearch[0];
            }
            else {
                // found no credential with these identifiers (match none for insert)
                this.credential = {$exists: false};
            }
        }
        // update credential or create if none was found
        this.credential = await Credential.findOneAndUpdate(
            {_id: this.credential},
            {$set: {...identifiers, ...details}},
            {useFindAndModify: true, new: true, upsert: true}
        );
    }

    async markCredentialsInvalid() {
        this.credential.auth_is_valid = false;
        return await this.credential.save();
    }
}

module.exports = { Auther };