import { describe, it, expect, beforeEach } from 'vitest';
import { parseMessage, parseSnoozeRequest, getTomorrow10am, type ParseContext } from './parser.js';

describe('parseMessage', () => {
  const defaultContext: ParseContext = {
    timezone: 'Asia/Kolkata',
    currentTime: new Date('2024-01-15T10:00:00+05:30'),
  };

  describe('intent detection', () => {
    it('should detect help intent', async () => {
      const result = await parseMessage('help', defaultContext);
      expect(result.intent).toBe('help');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should detect list_tasks intent', async () => {
      const result = await parseMessage('list', defaultContext);
      expect(result.intent).toBe('list_tasks');
    });

    it('should detect list_tasks for ideas', async () => {
      const result = await parseMessage('ideas', defaultContext);
      expect(result.intent).toBe('list_tasks');
    });

    it('should detect mark_done intent', async () => {
      const result = await parseMessage('done', defaultContext);
      expect(result.intent).toBe('mark_done');
    });

    it('should detect snooze intent', async () => {
      const result = await parseMessage('snooze', defaultContext);
      expect(result.intent).toBe('snooze');
    });

    it('should detect settings intent', async () => {
      const result = await parseMessage('settings', defaultContext);
      expect(result.intent).toBe('set_pref');
    });
  });

  describe('task creation', () => {
    it('should create TODO from "remind me" messages', async () => {
      const result = await parseMessage('remind me tomorrow to send the deck', defaultContext);
      expect(result.intent).toBe('create_task');
      expect(result.task?.status).toBe('TODO');
      expect(result.task?.title).toContain('send the deck');
    });

    it('should create IDEA from "idea:" prefix', async () => {
      const result = await parseMessage('idea: build a newsletter app', defaultContext);
      expect(result.intent).toBe('create_task');
      expect(result.task?.status).toBe('IDEA');
      expect(result.task?.title).toBe('build a newsletter app');
    });

    it('should create TODO from "todo:" prefix', async () => {
      const result = await parseMessage('todo: review the proposal', defaultContext);
      expect(result.intent).toBe('create_task');
      expect(result.task?.status).toBe('TODO');
    });

    it('should parse time expressions', async () => {
      const result = await parseMessage('remind me at 3pm to call John', defaultContext);
      expect(result.intent).toBe('create_task');
      expect(result.task?.reminderAt).toBeDefined();
    });
  });

  describe('snooze parsing', () => {
    it('should detect snooze with hours', async () => {
      const result = await parseMessage('snooze 2h', defaultContext);
      expect(result.intent).toBe('snooze');
      expect(result.snoozeMinutes).toBe(120);
    });

    it('should detect snooze with minutes', async () => {
      const result = await parseMessage('snooze 30 minutes', defaultContext);
      expect(result.intent).toBe('snooze');
      expect(result.snoozeMinutes).toBe(30);
    });
  });
});

describe('parseSnoozeRequest', () => {
  it('should parse minutes', () => {
    expect(parseSnoozeRequest('30 minutes')).toBe(30);
    expect(parseSnoozeRequest('15min')).toBe(15);
    expect(parseSnoozeRequest('45 mins')).toBe(45);
  });

  it('should parse hours', () => {
    expect(parseSnoozeRequest('1 hour')).toBe(60);
    expect(parseSnoozeRequest('2h')).toBe(120);
    expect(parseSnoozeRequest('3 hours')).toBe(180);
  });

  it('should return -1 for tomorrow', () => {
    expect(parseSnoozeRequest('tomorrow')).toBe(-1);
    expect(parseSnoozeRequest('tomorrow morning')).toBe(-1);
  });

  it('should default to 15 for unknown input', () => {
    expect(parseSnoozeRequest('soon')).toBe(15);
    expect(parseSnoozeRequest('')).toBe(15);
  });
});

describe('getTomorrow10am', () => {
  it('should return 10am tomorrow in the given timezone', () => {
    const result = getTomorrow10am('Asia/Kolkata');
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeGreaterThan(Date.now());
  });
});
