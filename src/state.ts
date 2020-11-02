import * as vscode from 'vscode';
import * as pipelines from './pipelines';

//namespace scriptastic {

export class State {

   public workspaceConfig: vscode.WorkspaceConfiguration;

   constructor(private context: vscode.ExtensionContext) {
      this.workspaceConfig = vscode.workspace.getConfiguration('scriptastic');
   }

   // pipelines
   getPipelines(): Array<string> {
      return this.context.workspaceState.get('pipelines') as Array<string> || new Array<string>();
   }

   addPipeline(pipeline: pipelines.Pipeline) {
      let pipelineArr = this.getPipelines();
      if (!pipelineArr.find(n => n === pipeline.name)) {
         pipelineArr.push(pipeline.name);
         this.context.workspaceState.update('pipelines', pipelineArr);
      }
      this.updatePipeline(pipeline);
   }

   remPipeline(name: string): boolean {
      let pipelineArr = this.getPipelines();
      let pipeline = pipelineArr.find(n => n === name);
      if (pipeline) {
         pipelineArr.splice(pipelineArr.indexOf(pipeline), 1);
         this.context.workspaceState.update('pipelines', pipelineArr);
         this.context.workspaceState.update(name, undefined);
         return true;
      }
      return false; // not found
   }

   getPipeline(name?: string): pipelines.Pipeline | undefined {
      if (name) {
         return this.context.workspaceState.get(name);
      }
      return undefined;
   }

   updatePipeline(pipeline: pipelines.Pipeline) {
      this.context.workspaceState.update(pipeline.name, pipeline);
   }

   getConfigurationPropertyAsString(name: string, platform?: string): string | undefined {
      const property = this.workspaceConfig.inspect(name + (platform !== undefined ? ('.' + platform) : ''));
      if (property) {
         const globalValue = property.globalValue as string;
         if (globalValue !== undefined) {
            return globalValue;
         }
         const workspaceValue = property.workspaceValue as string;
         if (workspaceValue !== undefined) {
            return workspaceValue;
         }
         const defaultValue = property.defaultValue as string;
         if (defaultValue !== undefined) {
            return defaultValue;
         }
      }
      return undefined;
   }
}

//}