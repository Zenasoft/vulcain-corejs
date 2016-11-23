import {expect} from "chai";
import {System} from "../../dist/configurations/globals/system";

let urlExcepted = "http://localhost:8080/api/alert?tag=RED&tag=BLUE&in=00001";
let urlExceptedPath = "http://localhost:8080/api/alert/id";

describe('SystemHelper', function () {

    it('should create url with query string', function () {
        expect(System.createUrl("http://localhost:8080/api/alert?tag=RED&tag=BLUE", {
            in: "00001"
        })).to.equal(urlExcepted);
    });

    it('should create url with path', function () {
        expect(System.createUrl("http://localhost:8080/api/alert", "id")).to.equal(urlExceptedPath);
    });


    it('should expected an error with querystring and path', function () {
        expect(function () {
            System.createUrl("http://localhost:8080/api/alert?type=RED", "id")
        }).to.throw(Error);
    });


});
