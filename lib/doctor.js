import 'colors';
import _ from 'lodash';
import log from './logger';
import { version } from '../../package.json'; // eslint-disable-line import/no-unresolved
import ora from 'ora';

class FixSkippedError extends Error {
}

class DoctorCheck {
  constructor (opts = {}) {
    this.autofix = !!opts.autofix;
  }

  diagnose () { throw new Error('Not Implemented!'); }

  fix () {
    // return string for manual fixes.
    throw new Error('Not Implemented!');
  }
}

class Doctor {
  constructor () {
    this.checks = [];
    this.checkOptionals = [];
    this.toFix = [];
    this.toFixOptionals = [];
    this.spinner = ora({text: 'checking...'});
  }

  register (checks) {
    checks = Array.isArray(checks) ? checks : [checks];
    this.checks = this.checks.concat(checks);
  }

  async diagnose () {
    this.spinner.info(`### Diagnostic for ${'necessary'.green} dependencies starting ###`).start();
    this.toFix = [];
    for (const check of this.checks) {
      const res = await check.diagnose();
      if (res.optional) {
        this.checkOptionals.push(check);
        continue;
      }
      await this.diagnosticResultMessage(res, this.toFix, check);
    }
    this.spinner.info(`### Diagnostic for necessary dependencies completed, ${await this.fixMessage(this.toFix.length)}. ###`).start();
    this.spinner.info(' ').start();

    this.spinner.info(`### Diagnostic for ${'optional'.yellow} dependencies starting ###`).start();
    this.toFixOptionals = [];
    for (const checkOptional of this.checkOptionals) {
      await this.diagnosticResultMessage(await checkOptional.diagnose(), this.toFixOptionals, checkOptional);
    }
    this.spinner.info(`### Diagnostic for optional dependencies completed, ${await this.fixMessage(this.toFixOptionals.length, true)}. ###`).start();
    this.spinner.info(' ').start();
  }

  async reportManualFixes (fix, fixOptioal) {
    const manualFixes = _.filter(fix, (f) => {return !f.check.autofix;});
    const manualFixesOptional = _.filter(fixOptioal, (f) => {return !f.check.autofix;});

    if (manualFixes.length > 0) {
      this.spinner.info('### Manual Fixes Needed ###').start();
      this.spinner.info('The configuration cannot be automatically fixed, please do the following first:').start();
      // for manual fixes, the fix method always return a string
      const fixMessages = [];
      for (const f of manualFixes) {
        fixMessages.push(await f.check.fix());
      }
      for (const m of _.uniq(fixMessages)) {
        this.spinner.warn(` \u279C ${m}`).start();
      }

      this.spinner.info(' ').start();
    }
    if (manualFixesOptional.length > 0) {
      this.spinner.info('### Optional Manual Fixes ###').start();
      this.spinner.info('The configuration can install optionally. Please do the following manually:').start();
      // for manual fixes, the fix method always return a string
      const fixMessages = [];
      for (const f of manualFixesOptional) {
        fixMessages.push(await f.check.fix());
      }
      for (const m of _.uniq(fixMessages)) {
        this.spinner.warn(` \u279C ${m}`).start();
      }
      this.spinner.info(' ').start();
    }

    if (manualFixes.length > 0 || manualFixesOptional.length > 0) {
      this.spinner.info('###').start();
      this.spinner.info('Bye! Run appium-doctor again when all manual fixes have been applied!').start();
      this.spinner.info(' ').start();
      this.spinner.info(' ').start();
      return true;
    }
    return false;
  }

  async runAutoFix (f) {
    this.spinner.info(`### Fixing: ${f.error} ###`).start();
    try {
      await f.check.fix();
    } catch (err) {
      if (err instanceof FixSkippedError) {
        this.spinner.info('### Skipped fix ###').start();
        return;
      } else {
        this.spinner.warn(`${err}`.replace(/\n$/g, ' ')).start();
        this.spinner.info('### Fix did not succeed ###').start();
        return;
      }
    }
    this.spinner.info('Checking if this was fixed:').start();
    let res = await f.check.diagnose();
    if (res.ok) {
      f.fixed = true;
      this.spinner.info(` ${'\u2714'.green} ${res.message}`).start();
      this.spinner.info('### Fix was successfully applied ###').start();
    } else {
      this.spinner.info(` ${'\u2716'.red} ${res.message}`).start();
      this.spinner.info('### Fix was applied but issue remains ###').start();
    }
  }

  async runAutoFixes () {
    let autoFixes = _.filter(this.toFix, (f) => {return f.check.autofix;});
    for (let f of autoFixes) {
      await this.runAutoFix(f);
      this.spinner.info(' ').start();
    }
    if (_.find(autoFixes, (f) => { return !f.fixed; })) {
      // a few issues remain.
      this.spinner.info('Bye! A few issues remain, fix manually and/or rerun appium-doctor!').start();
    } else {
      // nothing left to fix.
      this.spinner.info('Bye! All issues have been fixed!').start();
    }
    this.spinner.info(' ').start();
  }

  async run () {
    this.spinner.start();

    this.spinner.info(`Appium Doctor v.${version}`).start();
    await this.diagnose();
    if (await this.reportSuccess(this.toFix.length, this.toFixOptionals.length)) {
      this.spinner.start();
      return;
    }
    if (await this.reportManualFixes(this.toFix, this.toFixOptionals)) {
      this.spinner.stop();
      return;
    }
    await this.runAutoFixes();
    this.spinner.stop();
  }

  //// generating messages
  async diagnosticResultMessage (result, toFixList, check) { // eslint-disable-line require-await
    if (result.ok) {
      this.spinner.succeed(` ${result.message}`).start();
    } else {
      if (result.optional) {
        this.spinner.warn(` ${result.message}`).start();
      } else {
        this.spinner.fail(` ${result.message}`).start();
      }
      toFixList.push({
        error: result.message,
        check
      });
    }
  }

  async fixMessage (length, optional = false) { // eslint-disable-line require-await
    let message;
    switch (length) {
      case 0:
        message = 'no fix';
        break;
      case 1:
        message = 'one fix';
        break;
      default:
        message = `${length} fixes`;
    }
    return `${message} ${optional ? 'possible' : 'needed'}`;
  }

  async reportSuccess (length, lengthOptional) { // eslint-disable-line require-await
    if (length === 0 && lengthOptional === 0) {
      log.info('Everything looks good, bye!');
      log.info(' ');
      return true;
    } else {
      return false;
    }
  }
}

export { Doctor, DoctorCheck, FixSkippedError };
