import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as fe from './fileExplorer';
import * as mkdirp from 'mkdirp';
import * as cp from 'child_process';
import { Script } from 'vm';
import { prototype } from 'events';
import { State } from './state';
import { Pipe } from 'stream';
import { getVSCodeDownloadUrl } from 'vscode-test/out/util';

export class Pipeline {

   public run: number = 0;
   public mtimeMs: number = 0;

   constructor(public readonly name: string,
      public script: Array<string> = new Array<string>()) {
   }
}

class PipelineResources {

   outputCh: vscode.OutputChannel;
   proc: cp.ChildProcess | undefined = undefined;

   constructor(public readonly name: string) {
      this.outputCh = vscode.window.createOutputChannel(name + " - Scriptastic");
   }
}

export class Dependency extends vscode.TreeItem {

   constructor(readonly name: string,
      readonly contextValue?: string,
      readonly collapsibleState?: vscode.TreeItemCollapsibleState,
      readonly resourceUri?: vscode.Uri,
      readonly command?: vscode.Command,
      readonly pipeline?: string) {
      super(name, collapsibleState);
   }
   /*
   get tooltip(): string | undefined {
      return this.resourceUri?.fsPath;
   }

   get description(): string | undefined {
      if (this.contextValue === 'running') {
         return '[' + this.contextValue + ']';
      }
      return undefined;
   }*/
}

export class PipelinesTreeDataProvider implements vscode.TreeDataProvider<Dependency> {

   private _onDidChangeTreeData: vscode.EventEmitter<Dependency | undefined> = new vscode.EventEmitter<Dependency | undefined>();
   readonly onDidChangeTreeData: vscode.Event<Dependency | undefined> = this._onDidChangeTreeData.event;
   private nameToResourcesMap: { [name: string]: PipelineResources | undefined; } = {};

   constructor(private context: vscode.ExtensionContext,
      private state: State,
      private on: (event: string, pipeline: string) => void | undefined) {
   }

   private pipelineResources(name: string): PipelineResources {
      const res = this.nameToResourcesMap[name] || new PipelineResources(name);
      this.nameToResourcesMap[name] = res;
      return res;
   }

   refresh(): void {
      this._onDidChangeTreeData.fire(undefined);
   }

   async add() {
      try {
         // get name
         const input = await vscode.window.showInputBox({ prompt: 'Enter pipeline name.' });
         if (!input) {
            return;
         }

         // replace any spaces with '_' to avoid pathing issues when launching container
         //const name = input.replace(/ /g, '_');
         const name = input;

         // create new Pipeline object
         let pipeline = new Pipeline(name);

         // add new Pipeline object to workspace state
         this.state.addPipeline(pipeline);

         // refresh view
         this.refresh();

         // invoke add event cb
         this.on('added', name);
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
   }

   async addScript(name: string) {
      try {
         let pipeline = this.state.getPipeline(name);
         if (!pipeline) {
            vscode.window.showErrorMessage('Pipeline not found: ' + name);
            return;
         }
         const script = await vscode.window.showOpenDialog({ canSelectFolders: false, canSelectFiles: true, canSelectMany: false, openLabel: 'Select Script File' });//, filters: { 'Nextflow Config': ['config'] } });
         if (script) {
            pipeline.script.push(script[0].fsPath);
            this.state.updatePipeline(pipeline);
            this.refresh();
         }
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
   }

   async rem(name: string): Promise<boolean> {
      try {
         const pipelineRes = this.nameToResourcesMap[name];
         if (pipelineRes && pipelineRes.proc !== undefined) {
            vscode.window.showWarningMessage('Pipeline is running; please stop it before attempting to remove');
            return Promise.resolve(false);
         }
         let selection = await vscode.window.showWarningMessage('Remove "' + name + '" pipeline?  Script file references will NOT be deleted', 'Yes, Remove', 'Cancel');
         if (selection === 'Yes, Remove') {
            const pipeline = this.state.getPipeline(name);
            if (pipeline) {
               // hide/dispose output
               if (pipelineRes) {
                  pipelineRes.outputCh.hide();
                  pipelineRes.outputCh.dispose();
               }
               this.nameToResourcesMap[name] = undefined;
               this.state.remPipeline(name);
               this.refresh();
               // invoke removed event cb
               this.on('removed', name);
               return Promise.resolve(true);
            }
         }
      }
      catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
      return Promise.resolve(false);
   }

   remDep(dependency: Dependency): boolean {
      try {
         if (!dependency.pipeline) {
            return false;
         }
         const pipelineRes = this.nameToResourcesMap[dependency.pipeline];
         if (pipelineRes && pipelineRes.proc !== undefined) {
            vscode.window.showWarningMessage('Pipeline is running; please stop it before attempting to remove dependencies');
            return false;
         }
         let pipeline = this.state.getPipeline(dependency.pipeline);
         if (pipeline) {
            if (dependency.resourceUri) {
               const index = pipeline.script.indexOf(dependency.resourceUri.fsPath);
               if (index >= 0) {
                  pipeline.script.splice(pipeline.script.indexOf(dependency.resourceUri.fsPath), 1);
                  this.state.updatePipeline(pipeline);
                  this.refresh();
                  return true;
               }
            }
         }
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
      return false;
   }

   async run(name: string, resume?: boolean | false) {
      try {
         const pipeline = this.state.getPipeline(name);
         if (!pipeline) {
            vscode.window.showErrorMessage('Pipeline not found: ' + name);
            return;
         }
         const pipelineRes = this.pipelineResources(name);
         if (pipelineRes.proc !== undefined) {
            vscode.window.showErrorMessage('Pipeline already running');
            return;
         }
         if (pipeline.script.length === 0) {
            vscode.window.showErrorMessage('Empty pipeline; add at least one script to run');
            return;
         }

         // formulate params
         let params = ['"', '/c', pipeline.script[0]];
         for (let i = 1; i < pipeline.script.length; i++) {
            params.push('&');
            params.push(pipeline.script[i]);
         }
         params.push('"');

         // clear/show output  
         pipelineRes.outputCh.clear();
         pipelineRes.outputCh.show();

         // output command being executed
         //pipelineRes.outputCh.append(command);

         // get path to shell exe from settings
         // TODO: handle OSX/Linux
         const automationShell = this.state.getConfigurationPropertyAsString('shellExec.windows') || 'cmd.exe';

         // spawn
         const proc = cp.spawn(automationShell, params);
         pipelineRes.proc = proc;
         this.refresh();

         // invoke started event cb
         this.on('started', name);

         // stdout cb
         proc.stdout.on('data', (data) => {
            // invoke updated event cb
            this.on('updated', name);
            pipelineRes.outputCh.append(data.toString());
         });

         // stderr cb
         proc.stderr.on('data', (data) => {
            // invoke updated event cb
            this.on('updated', name);
            pipelineRes.outputCh.append(data.toString());
         });

         // close cb
         proc.on('close', async (code) => {
            pipelineRes.proc = undefined;
            this.refresh();
            // invoke stopped event cb
            this.on('stopped', name);
            /*let selection = (code === 0 ?
               await vscode.window.showInformationMessage('Nextflow process exited with code: ' + code.toString(), 'Open Report') :
               await vscode.window.showWarningMessage('Nextflow process exited with code: ' + code.toString(), 'Open Report'));
            if (selection === 'Open Report') {
               cp.spawn('open', [path.join(workFolder, 'report.htm')]);
            }*/
         });
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
   }

   stop(name: string) {
      try {
         const pipelineRes = this.nameToResourcesMap[name];
         if (pipelineRes) {
            if (pipelineRes.proc === undefined) {
               vscode.window.showWarningMessage('Pipeline not running');
               return;
            }

            pipelineRes.proc.kill("SIGINT");
         }
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
   }

   moveUp(dependency: Dependency): boolean {
      try {
         if (!dependency.pipeline) {
            return false;
         }
         const pipelineRes = this.nameToResourcesMap[dependency.pipeline];
         if (pipelineRes && pipelineRes.proc !== undefined) {
            vscode.window.showWarningMessage('Pipeline is running; please stop it before attempting to move dependencies');
            return false;
         }
         let pipeline = this.state.getPipeline(dependency.pipeline);
         if (pipeline) {
            if (dependency.resourceUri) {
               const index = pipeline.script.indexOf(dependency.resourceUri.fsPath);
               if (index >= 1) {
                  pipeline.script.splice(index - 1, 0, pipeline.script.splice(index, 1)[0]);
                  this.state.updatePipeline(pipeline);
                  this.refresh();
                  return true;
               }
            }
         }
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
      return false;
   }

   moveDown(dependency: Dependency): boolean {
      try {
         if (!dependency.pipeline) {
            return false;
         }
         const pipelineRes = this.nameToResourcesMap[dependency.pipeline];
         if (pipelineRes && pipelineRes.proc !== undefined) {
            vscode.window.showWarningMessage('Pipeline is running; please stop it before attempting to move dependencies');
            return false;
         }
         let pipeline = this.state.getPipeline(dependency.pipeline);
         if (pipeline) {
            if (dependency.resourceUri) {
               const index = pipeline.script.indexOf(dependency.resourceUri.fsPath);
               if (index >= 0 && index < pipeline.script.length - 1) {
                  pipeline.script.splice(index + 1, 0, pipeline.script.splice(index, 1)[0]);
                  this.state.updatePipeline(pipeline);
                  this.refresh();
                  return true;
               }
            }
         }
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
      return false;
   }

   getChildren(element?: Dependency): vscode.ProviderResult<Dependency[]> {
      try {
         if (element) {
            let pipeline = this.state.getPipeline(element.name);
            if (pipeline) {
               let children = new Array<Dependency>();
               // script
               pipeline.script.forEach(script => {
                  children.push(new Dependency(path.basename(script), 'script', vscode.TreeItemCollapsibleState.None, vscode.Uri.file(script), { command: 'pipelines.openFile', title: "Open File", arguments: [vscode.Uri.file(script)] }, element.name));
               });

               return Promise.resolve(children);
            }
         } else {
            let pipelineArr = this.state.getPipelines();
            if (pipelineArr) {
               let children = new Array<Dependency>();
               pipelineArr.forEach(name => {
                  const pipelineRes = this.pipelineResources(name);
                  const contextValue = pipelineRes.proc ? 'running' : 'stopped';
                  let dependency = new Dependency(name, contextValue, vscode.TreeItemCollapsibleState.Collapsed);
                  children.push(dependency);
               });

               return Promise.resolve(children);
            }
         }

         return Promise.resolve([]);
      } catch (err) {
         vscode.window.showErrorMessage(err.toString());
      }
   }

   getTreeItem(element: Dependency): Dependency {
      return element;
   }
}