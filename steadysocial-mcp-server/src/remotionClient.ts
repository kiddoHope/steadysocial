import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface RemotionProjectInfo {
  name: string;
  compositionsCount: number;
  path: string;
}

export interface CompositionInfo {
  id: string;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
}

/**
 * Remotion client for managing and rendering Remotion video projects
 */
export class RemotionClient {
  /**
   * List all Remotion compositions in a project
   */
  static listCompositions(projectPath: string): CompositionInfo[] {
    try {
      const command = `npx remotion list ${projectPath}`;
      const output = execSync(command, { encoding: 'utf-8' });
      
      // Parse output and return compositions
      console.log('Remotion compositions output:', output);
      return [];
    } catch (error) {
      console.error('Error listing compositions:', error);
      return [];
    }
  }

  /**
   * Check if a Remotion project exists and is valid
   */
  static validateProject(projectPath: string): boolean {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return false;
      }

      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.dependencies?.remotion !== undefined;
    } catch (error) {
      return false;
    }
  }

  /**
   * Render a Remotion composition to video
   */
  static async renderComposition(
    projectPath: string,
    compositionId: string,
    outputPath: string,
    options?: {
      fps?: number;
      width?: number;
      height?: number;
      quality?: number;
    }
  ): Promise<string> {
    try {
      const args = [
        `render ${compositionId}`,
        `--out ${outputPath}`,
      ];

      if (options?.fps) args.push(`--fps ${options.fps}`);
      if (options?.width) args.push(`--width ${options.width}`);
      if (options?.height) args.push(`--height ${options.height}`);
      if (options?.quality) args.push(`--quality ${options.quality}`);

      const command = `npx remotion ${args.join(' ')} ${projectPath}`;
      execSync(command, { stdio: 'inherit' });

      return outputPath;
    } catch (error) {
      throw new Error(`Failed to render composition: ${error}`);
    }
  }

  /**
   * Get project metadata
   */
  static getProjectInfo(projectPath: string): RemotionProjectInfo {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    return {
      name: packageJson.name || 'Unknown',
      compositionsCount: 0,
      path: projectPath,
    };
  }

  /**
   * Create a new Remotion project from a template
   */
  static createProject(projectName: string, templateType: 'blank' | 'hello' = 'blank'): string {
    try {
      const command = `npx create-video@latest --yes --${templateType} --no-tailwind ${projectName}`;
      execSync(command, { stdio: 'inherit' });
      return path.resolve(process.cwd(), projectName);
    } catch (error) {
      throw new Error(`Failed to create Remotion project: ${error}`);
    }
  }

  /**
   * Preview a Remotion composition in the browser
   */
  static previewComposition(
    projectPath: string,
    compositionId?: string
  ): void {
    try {
      let command = 'npx remotion preview';
      if (compositionId) {
        command += ` --default-composition ${compositionId}`;
      }
      command += ` ${projectPath}`;

      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      throw new Error(`Failed to preview composition: ${error}`);
    }
  }
}

export default RemotionClient;
