import {TestContainer} from "../../dist/di/containers";
import {expect} from "chai";
import {Model, Property, Reference, Validator} from "../../dist/schemas/annotations";
import {Domain} from "../../dist/schemas/schema";
import 'mocha';
import { SchemaStandardTypes } from "../../dist/schemas/standards";

@Model()
class BaseModel {
    @Property({type: "string", required: true})
    @Validator("length", {min: 2})
    baseText: string;
}

@Model({extends: "BaseModel"})
class SimpleModel extends BaseModel {
    @Property({ type: 'string', required: true})
    text: string;
    @Property({type:'number'})
    number: number;
}

@Model()
class ReferenceModel {
    @Reference({item: "SimpleModel", cardinality: "one", required: true})
    simple: SimpleModel;
    @Reference({item: "SimpleModel", cardinality: "many"})
    multiples: Array<SimpleModel>;
}


@Model()
class EmailModel {
    @Property({type: SchemaStandardTypes.email})
    email: string;
}

@Model()
class UrlModel {
    @Property({type: "url"})
    url: string;
}

@Model()
class AlphanumericModel {
    @Property({type: "alphanumeric"})
    value: string;
}

@Model()
class DateIsoModel {
    @Property({type: "date-iso8601"})
    date: string;
}


let container = new TestContainer("Test");

describe("Validate data", function () {

    it("should validate base class", async() => {
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("SimpleModel");

        let model: SimpleModel = {text: "text", number: 1, baseText: ""};
        let errors = await schema.validateAsync(null, model);
        expect(errors.length).equals(1);
        expect(errors[0].property).equals("baseText");
    });

    it("should validate call validator", async() => {
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("SimpleModel");

        let model: SimpleModel = {text: "text", number: 1, baseText: "a"};
        let errors = await schema.validateAsync(null, model);
        expect(errors.length).equals(1);
        expect(errors[0].property).equals("baseText");
    });

    it("should validate malformed number", async() => {
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("SimpleModel");

        let model = schema.bind({text: "text", number: "1w1", baseText: "text"});
        let errors = await schema.validateAsync(null, model);
        expect(errors.length).equals(1);
        expect(errors[0].property).equals("number");
    });

    it("should validate valid values", async() => {
        let model: SimpleModel = {text: "text", number: 1, baseText: "text"};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("SimpleModel");
        let errors = await schema.validateAsync(null, model);

        expect(errors.length).equals(0);
    });

    it("should validate values in reference", async() => {
        let model: any = { text: "text", number: "1M", baseText: "text" };
        let refs = { simple: model };

        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("ReferenceModel");
        let errors = await schema.validateAsync(null, refs);

        expect(errors.length).equals(1);
    });

    it("should validate invalid multiple references", async() => {
        let model: any = { text: "text", number: "1M", baseText: "text" };
        let refs = { simple: model, multiples: model };

        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("ReferenceModel");
        let errors = await schema.validateAsync(null, refs);

        expect(errors.length).equals(2);
    });

    it("should validate values in multiple references", async() => {
        let model: any = { text: "text", number: "1M", baseText: "text" };
        let refs = { simple: model, multiples: [model, model] };

        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("ReferenceModel");
        let errors = await schema.validateAsync(null, refs);

        expect(errors.length).equals(3);
    });

    it("should validate required reference", async() => {
        let refs = { };

        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("ReferenceModel");
        let errors = await schema.validateAsync(null, refs);

        expect(errors.length).equals(1);
    });

    // ---------------
    // email
    it('should validate email value', async() => {

        let model: EmailModel = {email: "first.name@email.com"};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("EmailModel");
        let errors = await schema.validateAsync(null, model);

        expect(errors.length).equals(0, 'The email is malformed');
    });
    it('should validate malformed email value', async() => {

        let model: EmailModel = {email: "first.name@email"};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("EmailModel");
        let errors = await schema.validateAsync(null, model);

        expect(errors.length).equals(1);
    });


    // ---------------
    // url
    it('should validate url value', async() => {

        let model: UrlModel = {url: "https://myWebsite.com/#ancre/1"};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("UrlModel");
        let errors = await schema.validateAsync(null, model);

        expect(errors.length).equals(0);
    });
    it('should validate malformed url value', async() => {

        let model: UrlModel = {url: "http://site.r"};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("UrlModel");
        let errors = await schema.validateAsync(null, model);

        expect(errors.length).equals(1);
    });

    // ---------------
    // Alphanumeric
    it('should validate alphanumeric value', async() => {

        let model: AlphanumericModel = {value: "abcde1345fghik6789"};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("AlphanumericModel");
        let errors = await schema.validateAsync(undefined, model);

        expect(errors.length).equals(0);
    });
    it('should validate malformed alphanumeric value', async() => {

        let model: AlphanumericModel = {value: "abc123!"};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("AlphanumericModel");
        let errors = await schema.validateAsync(undefined, model);

        expect(errors.length).equals(1);
    });

    // ---------------
    // Date ISO86
    it('should validate date ISO8601', async() => {

        let model: DateIsoModel = {date: new Date().toISOString()};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("DateIsoModel");
        let errors = await schema.validateAsync(undefined, model);

        expect(errors.length).equals(0);
    });


    it('should validate malformed date ISO8601', async() => {

        let model: DateIsoModel = {date: new Date().toDateString()};
        let domain = container.get<Domain>("Domain");
        let schema = domain.getSchema("DateIsoModel");
        let errors = await schema.validateAsync(undefined, model);

        expect(errors.length).equals(1);
    });

});
