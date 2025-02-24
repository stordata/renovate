import {
  RenovateConfig,
  defaultConfig,
  git,
  partial,
  platform,
} from '../../../../../test/util';
import { GlobalConfig } from '../../../../config/global';
import { logger } from '../../../../logger';
import type { PackageFile } from '../../../../manager/types';
import type { Pr } from '../../../../platform';
import type { BranchConfig } from '../../../types';
import { ensureOnboardingPr } from '.';

jest.mock('../../../../util/git');

describe('workers/repository/onboarding/pr/index', () => {
  describe('ensureOnboardingPr()', () => {
    let config: RenovateConfig;
    let packageFiles: Record<string, PackageFile[]>;
    let branches: BranchConfig[];
    beforeEach(() => {
      jest.resetAllMocks();
      config = {
        ...defaultConfig,
        errors: [],
        warnings: [],
        description: [],
      };
      packageFiles = { npm: [{ packageFile: 'package.json', deps: [] }] };
      branches = [];
      platform.massageMarkdown = jest.fn((input) => input);
      platform.createPr.mockResolvedValueOnce(partial<Pr>({}));
      GlobalConfig.reset();
    });
    let createPrBody: string;
    it('returns if onboarded', async () => {
      config.repoIsOnboarded = true;
      await expect(
        ensureOnboardingPr(config, packageFiles, branches)
      ).resolves.not.toThrow();
    });
    it('creates PR', async () => {
      await ensureOnboardingPr(config, packageFiles, branches);
      expect(platform.createPr).toHaveBeenCalledTimes(1);
      createPrBody = platform.createPr.mock.calls[0][0].prBody;
    });

    it('creates PR with labels', async () => {
      await ensureOnboardingPr(
        {
          ...config,
          labels: ['label'],
          addLabels: ['label', 'additional-label'],
        },
        packageFiles,
        branches
      );
      expect(platform.createPr).toHaveBeenCalledTimes(1);
      expect(platform.createPr.mock.calls[0][0].labels).toEqual([
        'label',
        'additional-label',
      ]);
    });

    it('creates PR with empty footer and header', async () => {
      await ensureOnboardingPr(
        {
          ...config,
          prHeader: '',
          prFooter: '',
        },
        packageFiles,
        branches
      );
      expect(platform.createPr).toHaveBeenCalledTimes(1);
      expect(platform.createPr.mock.calls[0][0].prBody).toMatchSnapshot();
    });

    it('creates PR with footer and header with trailing and leading newlines', async () => {
      await ensureOnboardingPr(
        {
          ...config,
          prHeader: '\r\r\nThis should not be the first line of the PR',
          prFooter:
            'There should be several empty lines at the end of the PR\r\n\n\n',
        },
        packageFiles,
        branches
      );
      expect(platform.createPr).toHaveBeenCalledTimes(1);
      expect(platform.createPr.mock.calls[0][0].prBody).toMatchSnapshot();
    });

    it('creates PR with footer and header using templating', async () => {
      config.baseBranch = 'some-branch';
      config.repository = 'test';
      await ensureOnboardingPr(
        {
          ...config,
          prHeader: 'This is a header for platform:{{platform}}',
          prFooter:
            'And this is a footer for repository:{{repository}} baseBranch:{{baseBranch}}',
        },
        packageFiles,
        branches
      );
      expect(platform.createPr).toHaveBeenCalledTimes(1);
      expect(platform.createPr.mock.calls[0][0].prBody).toMatch(
        /platform:github/
      );
      expect(platform.createPr.mock.calls[0][0].prBody).toMatch(
        /repository:test/
      );
      expect(platform.createPr.mock.calls[0][0].prBody).toMatchSnapshot();
    });

    it('returns if PR does not need updating', async () => {
      platform.getBranchPr.mockResolvedValue(
        partial<Pr>({
          title: 'Configure Renovate',
          body: createPrBody,
        })
      );
      await ensureOnboardingPr(config, packageFiles, branches);
      expect(platform.createPr).toHaveBeenCalledTimes(0);
      expect(platform.updatePr).toHaveBeenCalledTimes(0);
    });
    it('updates PR when conflicted', async () => {
      config.baseBranch = 'some-branch';
      platform.getBranchPr.mockResolvedValueOnce(
        partial<Pr>({
          title: 'Configure Renovate',
          body: createPrBody,
        })
      );
      git.isBranchConflicted.mockResolvedValueOnce(true);
      git.isBranchModified.mockResolvedValueOnce(true);
      await ensureOnboardingPr(config, {}, branches);
      expect(platform.createPr).toHaveBeenCalledTimes(0);
      expect(platform.updatePr).toHaveBeenCalledTimes(1);
    });
    it('updates PR when modified', async () => {
      config.baseBranch = 'some-branch';
      platform.getBranchPr.mockResolvedValueOnce(
        partial<Pr>({
          title: 'Configure Renovate',
          body: createPrBody,
        })
      );
      git.isBranchModified.mockResolvedValueOnce(true);
      await ensureOnboardingPr(config, {}, branches);
      expect(platform.createPr).toHaveBeenCalledTimes(0);
      expect(platform.updatePr).toHaveBeenCalledTimes(1);
    });
    it('creates PR (no require config)', async () => {
      config.requireConfig = false;
      await ensureOnboardingPr(config, packageFiles, branches);
      expect(platform.createPr).toHaveBeenCalledTimes(1);
    });
    it('dryrun of updates PR when modified', async () => {
      GlobalConfig.set({ dryRun: true });
      config.baseBranch = 'some-branch';
      platform.getBranchPr.mockResolvedValueOnce(
        partial<Pr>({
          title: 'Configure Renovate',
          body: createPrBody,
        })
      );
      git.isBranchConflicted.mockResolvedValueOnce(true);
      git.isBranchModified.mockResolvedValueOnce(true);
      await ensureOnboardingPr(config, {}, branches);
      expect(logger.info).toHaveBeenCalledWith(
        'DRY-RUN: Would check branch renovate/configure'
      );
      expect(logger.info).toHaveBeenLastCalledWith(
        'DRY-RUN: Would update onboarding PR'
      );
    });
    it('dryrun of creates PR', async () => {
      GlobalConfig.set({ dryRun: true });
      await ensureOnboardingPr(config, packageFiles, branches);
      expect(logger.info).toHaveBeenCalledWith(
        'DRY-RUN: Would check branch renovate/configure'
      );
      expect(logger.info).toHaveBeenLastCalledWith(
        'DRY-RUN: Would create onboarding PR'
      );
    });
  });
});
