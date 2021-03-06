import { CircuitBreakerFactory } from "../../src/commands/circuitBreaker";
import { CommandProperties } from "../../src/commands/commandProperties";
import { ICommandMetrics, CommandMetricsFactory } from "../../src/commands/metrics/commandMetricsFactory";
import { expect } from 'chai';
import { DynamicConfiguration } from '../../src/configurations/dynamicConfiguration';
import ActualTime from "../../src/utils/actualTime";

beforeEach(function () {
    ActualTime.enableVirtualTimer();
    DynamicConfiguration.reset();
    CommandMetricsFactory.resetCache();
    CircuitBreakerFactory.resetCache();
});

function getCBOptions(commandKey) {

    return new CommandProperties(commandKey, commandKey, {
        circuitBreakerSleepWindowInMilliseconds: 1000,
        circuitBreakerErrorThresholdPercentage: 10,
        circuitBreakerRequestVolumeThreshold: 1
    }
    );
}

describe("CircuitBreaker", function () {

    it("should cache instances in the factory", function () {
        let cb = CircuitBreakerFactory.getOrCreate(getCBOptions("Test"));
        expect(cb).to.not.be.undefined;
        expect(CircuitBreakerFactory.getCache().size).to.equal(1);
        cb = CircuitBreakerFactory.getOrCreate(getCBOptions("AnotherTest"));
        expect(cb).to.not.be.undefined;
        expect(CircuitBreakerFactory.getCache().size).to.equal(2);
    });

    it("should open circuit if error threshold is greater than error percentage", function () {
        let options = getCBOptions("Test1");
        let cb = CircuitBreakerFactory.getOrCreate(options);
        let metrics = CommandMetricsFactory.getOrCreate(options);
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        expect(cb.isOpen()).to.be.true;
    });

    it("should not open circuit if the volume has not reached threshold", function () {
        let options = getCBOptions("Test2");
        options.circuitBreakerRequestVolumeThreshold.set(2);
        options.circuitBreakerErrorThresholdPercentage.set(50);

        let cb = CircuitBreakerFactory.getOrCreate(options);
        let metrics = CommandMetricsFactory.getOrCreate(options);
        metrics.markSuccess();
        metrics.markFailure();
        expect(cb.isOpen()).to.be.false;

        metrics.markFailure();

        expect(cb.isOpen()).to.be.true;
    });

    it("should retry after a configured sleep time, if the circuit was open", function () {
        let options = getCBOptions("Test3");
        let cb = CircuitBreakerFactory.getOrCreate(options);
        let metrics = CommandMetricsFactory.getOrCreate(options);
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();

        expect(cb.allowRequest()).to.be.false;
        ActualTime.fastForwardActualTime(10000);
        expect(cb.isOpen()).to.be.true;
        expect(cb.allowRequest()).to.be.true;
    });

    it("should reset metrics after the circuit was closed again", function () {
        let options = getCBOptions("Test4");
        let cb = CircuitBreakerFactory.getOrCreate(options);
        let metrics = CommandMetricsFactory.getOrCreate(options);
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markSuccess();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();
        metrics.markFailure();

        expect(cb.allowRequest()).to.be.false;

        cb.markSuccess();
        expect(cb.allowRequest()).to.be.true;
    });

});