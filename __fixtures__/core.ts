import { jest } from '@jest/globals';

export const debug = jest.fn<(message: string) => void>();
export const error = jest.fn<(message: string | Error) => void>();
export const info = jest.fn<(message: string) => void>();
export const getInput = jest.fn<(name: string, options?: object) => string>();
export const getBooleanInput =
  jest.fn<(name: string, options?: object) => boolean>();
export const setOutput = jest.fn<(name: string, value: unknown) => void>();
export const setFailed = jest.fn<(message: string | Error) => void>();
export const warning = jest.fn<(message: string | Error) => void>();
