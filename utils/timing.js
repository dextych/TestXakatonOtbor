class TimingStats {
    constructor() {
        this.start = Date.now();
        this.end = null;
        this.steps = {};
    }

    recordStep(name, durationSec) {
        this.steps[name] = durationSec;
    }

    recordStepWithSubsteps(name, substeps) {
        this.steps[name] = substeps;
    }

    finalize() {
        this.end = Date.now();
        return this;
    }

    getTotalSec() {
        return (this.end - this.start) / 1000;
    }

    getGameTime() {
        return (this.steps.botFill || 0) + 
               (this.steps.round1?.total || 0) + 
               (this.steps.round2?.total || 0);
    }

    getActiveTime() {
        return (this.steps.roomCreation || 0) +
               (this.steps.playerJoin || 0) +
               (this.steps.stateCheck || 0) +
               (this.steps.round1?.selection || 0) +
               (this.steps.round1?.buyBoost || 0) +
               (this.steps.round1?.applyBoost || 0) +
               (this.steps.round2?.checkQualified || 0) +
               (this.steps.round2?.selection || 0) +
               (this.steps.round2?.buyBoost || 0);
    }
}

function measureStep(stepName, asyncFn) {
    return async (...args) => {
        const start = Date.now();
        const result = await asyncFn(...args);
        const duration = (Date.now() - start) / 1000;
        return { result, duration, stepName };
    };
}

module.exports = { TimingStats, measureStep };