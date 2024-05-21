import {
  matchStringTemplate,
  matchTemplates,
  insertHyphen,
} from '../src/utils';

describe('Util specs', () => {
  it('should match the string templates', () => {
    type Case = {
      inputString: string;
      template: string;
      matches: boolean;
      result?: Record<string, string>;
    };
    const list: Case[] = [
      {
        template: 'cmd.books.fetch',
        inputString: 'books.cmd',
        matches: false,
      },
      {
        template: 'cmd.books.fetch',
        inputString: 'cmd.books.fetch',
        matches: true,
      },
      {
        template: 'cmd.{{resource}}.fetch',
        inputString: 'cmd.cat.fetch',
        matches: true,
        result: {
          resource: 'cat',
        },
      },
      {
        template: 'cmd.ntk.{{resource}}',
        inputString: 'cmd.ntk.gpt.fetch',
        matches: true,
        result: {
          resource: 'gpt.fetch',
        },
      },
    ];
    for (const item of list) {
      const resp = matchStringTemplate(item.inputString, item.template);
      expect(resp.matched).toBe(item.matches);
      expect(resp.result?.resource).toBe(item.result?.resource);
    }
  });

  it('should match the string with list of templates', () => {
    type Case = {
      templates: string[];
      inputString: string;
      matchedTemplate?: string;
      result?: Record<string, string>;
    };
    const templates = [
      'cmd.books.fetch',
      'cmd.{{resource}}.fetch',
      'cmd.ntk.{{resource}}',
    ];
    const list: Case[] = [
      {
        templates,
        inputString: 'books.cmd',
        matchedTemplate: undefined,
      },
      {
        templates,
        inputString: 'cmd.ntk.',
        matchedTemplate: undefined,
      },
      {
        templates,
        inputString: 'cmd.books.fetch',
        matchedTemplate: templates[0],
      },
      {
        templates,
        inputString: 'cmd.cat.fetch',
        matchedTemplate: templates[1],
        result: {
          resource: 'cat',
        },
      },
      {
        templates,
        inputString: 'cmd.ntk.gpt.fetch',
        matchedTemplate: templates[1],
        result: {
          resource: 'ntk.gpt',
        },
      },
      {
        templates,
        inputString: 'cmd.ntk.gpt.summary',
        matchedTemplate: templates[2],
        result: {
          resource: 'gpt.summary',
        },
      },
    ];
    for (const item of list) {
      const resp = matchTemplates(item.inputString, item.templates);
      expect(resp?.matchedTemplate).toBe(item.matchedTemplate);
      expect(resp?.params?.resource).toBe(item.result?.resource);
    }
  });

  it(`should put hyphen in the right place`, () => {
    const resp = insertHyphen('4efaaf4d1e8720b39541901950019ee5', 8);
    expect(resp).toBe('4efaaf4d-1e8720b39541901950019ee5');
  });
});
