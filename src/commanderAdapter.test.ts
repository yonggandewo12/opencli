import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import type { CliCommand } from './registry.js';

const { mockExecuteCommand, mockRenderOutput } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
  mockRenderOutput: vi.fn(),
}));

vi.mock('./execution.js', () => ({
  executeCommand: mockExecuteCommand,
}));

vi.mock('./output.js', () => ({
  render: mockRenderOutput,
}));

import { registerCommandToProgram } from './commanderAdapter.js';

describe('commanderAdapter arg passing', () => {
  const cmd: CliCommand = {
    site: 'paperreview',
    name: 'submit',
    description: 'Submit a PDF',
    browser: false,
    args: [
      { name: 'pdf', positional: true, required: true, help: 'Path to the paper PDF' },
      { name: 'dry-run', type: 'bool', default: false, help: 'Validate only' },
      { name: 'prepare-only', type: 'bool', default: false, help: 'Prepare only' },
    ],
    func: vi.fn(),
  };

  beforeEach(() => {
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue([]);
    mockRenderOutput.mockReset();
    delete process.env.OPENCLI_VERBOSE;
    process.exitCode = undefined;
  });

  it('passes bool flag values through to executeCommand for coercion', async () => {
    const program = new Command();
    const siteCmd = program.command('paperreview');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync(['node', 'opencli', 'paperreview', 'submit', './paper.pdf', '--dry-run', 'false']);

    expect(mockExecuteCommand).toHaveBeenCalled();
    const kwargs = mockExecuteCommand.mock.calls[0][1];
    expect(kwargs.pdf).toBe('./paper.pdf');
    expect(kwargs).toHaveProperty('dry-run');
  });

  it('passes valueless bool flags as true to executeCommand', async () => {
    const program = new Command();
    const siteCmd = program.command('paperreview');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync(['node', 'opencli', 'paperreview', 'submit', './paper.pdf', '--prepare-only']);

    expect(mockExecuteCommand).toHaveBeenCalled();
    const kwargs = mockExecuteCommand.mock.calls[0][1];
    expect(kwargs.pdf).toBe('./paper.pdf');
    expect(kwargs['prepare-only']).toBe(true);
  });

  it('rejects invalid bool values before calling executeCommand', async () => {
    const program = new Command();
    const siteCmd = program.command('paperreview');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync(['node', 'opencli', 'paperreview', 'submit', './paper.pdf', '--dry-run', 'maybe']);

    // normalizeArgValue validates bools eagerly; executeCommand should not be reached
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });
});

describe('commanderAdapter boolean alias support', () => {
  const cmd: CliCommand = {
    site: 'reddit',
    name: 'save',
    description: 'Save a post',
    browser: false,
    args: [
      { name: 'post-id', positional: true, required: true, help: 'Post ID' },
      { name: 'undo', type: 'boolean', default: false, help: 'Unsave instead of save' },
    ],
    func: vi.fn(),
  };

  beforeEach(() => {
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue([]);
    mockRenderOutput.mockReset();
    delete process.env.OPENCLI_VERBOSE;
    process.exitCode = undefined;
  });

  it('coerces default false for boolean args to a real boolean', async () => {
    const program = new Command();
    const siteCmd = program.command('reddit');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync(['node', 'opencli', 'reddit', 'save', 't3_abc123']);

    expect(mockExecuteCommand).toHaveBeenCalled();
    const kwargs = mockExecuteCommand.mock.calls[0][1];
    expect(kwargs['post-id']).toBe('t3_abc123');
    expect(kwargs.undo).toBe(false);
  });

  it('coerces explicit false for boolean args to a real boolean', async () => {
    const program = new Command();
    const siteCmd = program.command('reddit');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync(['node', 'opencli', 'reddit', 'save', 't3_abc123', '--undo', 'false']);

    expect(mockExecuteCommand).toHaveBeenCalled();
    const kwargs = mockExecuteCommand.mock.calls[0][1];
    expect(kwargs.undo).toBe(false);
  });
});

describe('commanderAdapter value-required optional options', () => {
  const cmd: CliCommand = {
    site: 'instagram',
    name: 'post',
    description: 'Post to Instagram',
    browser: true,
    args: [
      { name: 'image', valueRequired: true, help: 'Single image path' },
      { name: 'images', valueRequired: true, help: 'Comma-separated image paths' },
      { name: 'content', positional: true, required: false, help: 'Caption text' },
    ],
    validateArgs: (kwargs) => {
      if (!kwargs.image && !kwargs.images) {
        throw new Error('media required');
      }
    },
    func: vi.fn(),
  };

  beforeEach(() => {
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue([]);
    mockRenderOutput.mockReset();
    delete process.env.OPENCLI_VERBOSE;
    process.exitCode = undefined;
  });

  it('requires a value when --image is present', async () => {
    const program = new Command();
    program.exitOverride();
    const siteCmd = program.command('instagram');
    registerCommandToProgram(siteCmd, cmd);

    await expect(
      program.parseAsync(['node', 'opencli', 'instagram', 'post', '--image']),
    ).rejects.toMatchObject({ code: 'commander.optionMissingArgument' });
    expect(mockExecuteCommand).not.toHaveBeenCalled();
  });

  it('runs validateArgs before executeCommand so missing media does not dispatch the browser command', async () => {
    const program = new Command();
    const siteCmd = program.command('instagram');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync(['node', 'opencli', 'instagram', 'post', 'caption only']);

    expect(mockExecuteCommand).not.toHaveBeenCalled();
    expect(process.exitCode).toBeDefined();
  });
});

describe('commanderAdapter command aliases', () => {
  const cmd: CliCommand = {
    site: 'notebooklm',
    name: 'get',
    aliases: ['metadata'],
    description: 'Get notebook metadata',
    browser: false,
    args: [],
    func: vi.fn(),
  };

  beforeEach(() => {
    mockExecuteCommand.mockReset();
    mockExecuteCommand.mockResolvedValue([]);
    mockRenderOutput.mockReset();
    delete process.env.OPENCLI_VERBOSE;
    process.exitCode = undefined;
  });

  it('registers aliases with Commander so compatibility names execute the same command', async () => {
    const program = new Command();
    const siteCmd = program.command('notebooklm');
    registerCommandToProgram(siteCmd, cmd);

    await program.parseAsync(['node', 'opencli', 'notebooklm', 'metadata']);

    expect(mockExecuteCommand).toHaveBeenCalledWith(cmd, {}, false);
  });
});
