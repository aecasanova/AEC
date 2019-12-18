// @flow strict

// FIXME temporary hack until https://github.com/eslint/eslint/pull/12484 is merged
/* eslint-disable require-await */

import { expect } from 'chai';
import { describe, it } from 'mocha';

import mapAsyncIterator from '../mapAsyncIterator';

describe('mapAsyncIterator', () => {
  it('maps over async values', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const doubles = mapAsyncIterator(source(), x => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 6, done: false });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('maps over async values with async function', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    // Flow test: this is *not* AsyncIterator<Promise<number>>
    const doubles: AsyncIterator<number> = mapAsyncIterator(
      source(),
      async x => (await x) + x,
    );

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 6, done: false });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('allows returning early from async values', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const doubles = mapAsyncIterator(source(), x => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Early return
    expect(await doubles.return()).to.deep.equal({
      value: undefined,
      done: true,
    });

    // Subsequent next calls
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('passes through early return from async values', async () => {
    async function* source() {
      try {
        yield 1;
        yield 2;
        yield 3;
      } finally {
        yield 'Done';
        yield 'Last';
      }
    }

    const doubles = mapAsyncIterator(source(), x => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Early return
    expect(await doubles.return()).to.deep.equal({
      value: 'DoneDone',
      done: false,
    });

    // Subsequent next calls may yield from finally block
    expect(await doubles.next()).to.deep.equal({
      value: 'LastLast',
      done: false,
    });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('allows throwing errors through async generators', async () => {
    async function* source() {
      yield 1;
      yield 2;
      yield 3;
    }

    const doubles = mapAsyncIterator(source(), x => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Throw error
    let caughtError;
    try {
      await doubles.throw('ouch');
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).to.equal('ouch');

    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('passes through caught errors through async generators', async () => {
    async function* source() {
      try {
        yield 1;
        yield 2;
        yield 3;
      } catch (e) {
        yield e;
      }
    }

    const doubles = mapAsyncIterator(source(), x => x + x);

    expect(await doubles.next()).to.deep.equal({ value: 2, done: false });
    expect(await doubles.next()).to.deep.equal({ value: 4, done: false });

    // Throw error
    expect(await doubles.throw('Ouch')).to.deep.equal({
      value: 'OuchOuch',
      done: false,
    });

    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  it('does not normally map over thrown errors', async () => {
    async function* source() {
      yield 'Hello';
      throw new Error('Goodbye');
    }

    const doubles = mapAsyncIterator(source(), x => x + x);

    expect(await doubles.next()).to.deep.equal({
      value: 'HelloHello',
      done: false,
    });

    let caughtError;
    try {
      await doubles.next();
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError && caughtError.message).to.equal('Goodbye');
  });

  it('maps over thrown errors if second callback provided', async () => {
    async function* source() {
      yield 'Hello';
      throw new Error('Goodbye');
    }

    const doubles = mapAsyncIterator(
      source(),
      x => x + x,
      error => error,
    );

    expect(await doubles.next()).to.deep.equal({
      value: 'HelloHello',
      done: false,
    });

    const result = await doubles.next();
    expect(result.value).to.be.instanceof(Error);
    expect(result.value && result.value.message).to.equal('Goodbye');
    expect(result.done).to.equal(false);

    expect(await doubles.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  });

  async function testClosesSourceWithMapper(mapper) {
    let didVisitFinally = false;

    async function* source() {
      try {
        yield 1;
        yield 2;
        yield 3;
      } finally {
        didVisitFinally = true;
        yield 1000;
      }
    }

    const throwOver1 = mapAsyncIterator(source(), mapper);

    expect(await throwOver1.next()).to.deep.equal({ value: 1, done: false });

    let expectedError;
    try {
      await throwOver1.next();
    } catch (error) {
      expectedError = error;
    }

    expect(expectedError).to.be.an('error');
    if (expectedError) {
      expect(expectedError.message).to.equal('Cannot count to 2');
    }

    expect(await throwOver1.next()).to.deep.equal({
      value: undefined,
      done: true,
    });

    expect(didVisitFinally).to.equal(true);
  }

  it('closes source if mapper throws an error', async () => {
    await testClosesSourceWithMapper(x => {
      if (x > 1) {
        throw new Error('Cannot count to ' + x);
      }
      return x;
    });
  });

  it('closes source if mapper rejects', async () => {
    await testClosesSourceWithMapper(x =>
      x > 1
        ? Promise.reject(new Error('Cannot count to ' + x))
        : Promise.resolve(x),
    );
  });

  async function testClosesSourceWithRejectMapper(mapper) {
    async function* source() {
      yield 1;
      throw new Error(2);
    }

    const throwOver1 = mapAsyncIterator(source(), x => x, mapper);

    expect(await throwOver1.next()).to.deep.equal({ value: 1, done: false });

    let expectedError;
    try {
      await throwOver1.next();
    } catch (error) {
      expectedError = error;
    }

    expect(expectedError).to.be.an('error');
    if (expectedError) {
      expect(expectedError.message).to.equal('Cannot count to 2');
    }

    expect(await throwOver1.next()).to.deep.equal({
      value: undefined,
      done: true,
    });
  }

  it('closes source if mapper throws an error', async () => {
    await testClosesSourceWithRejectMapper(error => {
      throw new Error('Cannot count to ' + error.message);
    });
  });

  it('closes source if mapper rejects', async () => {
    await testClosesSourceWithRejectMapper(error =>
      Promise.reject(new Error('Cannot count to ' + error.message)),
    );
  });
});
