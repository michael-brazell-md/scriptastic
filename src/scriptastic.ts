import * as vscode from 'vscode';
import * as pipelines from './pipelines';
import { State } from './state';

export class Scriptastic {

    private pipelinesViewer: vscode.TreeView<any>;
    private pipelinesTreeDataProvider: pipelines.PipelinesTreeDataProvider;
    //private runsViewer: vscode.TreeView<any>;
    //private runsTreeDataProvider: runs.RunsTreeDataProvider;
    private state: State;

    constructor(private context: vscode.ExtensionContext) {
        this.state = new State(context);

        // pipelines view
        this.pipelinesTreeDataProvider = new pipelines.PipelinesTreeDataProvider(context, this.state,
            (event: string, pipeline: string) => {
                switch (event) {
                    case 'started':
                    case 'updated':
                    case 'stopped':
                    case 'added':
                        //this.runsTreeDataProvider.refresh(pipeline);
                        break;
                    case 'removed':
                        //this.runsTreeDataProvider.refresh();
                        break;
                    default:
                        break;
                }
            });
        this.pipelinesViewer = vscode.window.createTreeView('pipelines', { treeDataProvider: this.pipelinesTreeDataProvider });
        /*
        this.pipelinesViewer.onDidChangeSelection(e => {
           this.onDidChangePipelinesSelection(e.selection);
        });
  
        // runs view
        this.runsTreeDataProvider = new runs.RunsTreeDataProvider(context, this.state);
        this.runsViewer = vscode.window.createTreeView('runs', { treeDataProvider : this.runsTreeDataProvider, canSelectMany: true });
  
        this.runsViewer.onDidChangeSelection(e => {
           this.onDidChangeRunsSelection(e.selection);
        });*/

        // register commands
        this.registerCommands(context);
    }

    private registerCommands(context: vscode.ExtensionContext) {
        // pipelines 
        this.registerCommand(context, 'pipelines.add', async () => {
            try {
                this.pipelinesTreeDataProvider.add();
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.addScript', async (dependency: pipelines.Dependency) => {
            try {
                this.pipelinesTreeDataProvider.addScript(dependency.name);
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.run', (dependency: pipelines.Dependency) => {
            try {
                // save modified workspace files before running
                vscode.workspace.saveAll(false).then(onfullfilled => {
                    this.pipelinesTreeDataProvider.run(dependency.name);
                    //this.runsTreeDataProvider.refresh(dependency.name);
                });
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.stop', (dependency: pipelines.Dependency) => {
            try {
                this.pipelinesTreeDataProvider.stop(dependency.name);
                //this.runsTreeDataProvider.refresh(dependency.name);
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.rename', async (dependency: pipelines.Dependency) => {
            try {
                const renamed = await this.pipelinesTreeDataProvider.rename(dependency.name);
                if (renamed) {
                }
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.remove', async (dependency: pipelines.Dependency) => {
            try {
                const removed = await this.pipelinesTreeDataProvider.rem(dependency.name);
                if (removed) {
                }
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.removeDep', (dependency: pipelines.Dependency) => {
            try {
                const removed = this.pipelinesTreeDataProvider.remDep(dependency);
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.moveScriptUp', (dependency: pipelines.Dependency) => {
            try {
                this.pipelinesTreeDataProvider.moveUp(dependency);
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.moveScriptDown', (dependency: pipelines.Dependency) => {
            try {
                this.pipelinesTreeDataProvider.moveDown(dependency);
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });

        this.registerCommand(context, 'pipelines.openFile', (resource: vscode.Uri) => {
            try {
                vscode.window.showTextDocument(resource);
            } catch (err) {
                vscode.window.showErrorMessage(err.toString());
            }
        });
    }

    private registerCommand(context: vscode.ExtensionContext, command: string, callback: (...args: any[]) => any, thisArg?: any) {
        try {
            let disposable = vscode.commands.registerCommand(command, callback);
            context.subscriptions.push(disposable);
        } catch (err) {
            vscode.window.showErrorMessage(err.toString());
        }
    }

    /*private onDidChangePipelinesSelection(selection: pipelines.Dependency[]) {
       if (selection[0].contextValue === 'pipeline') {
       }
    }
 
    private onDidChangeRunsSelection(selection: any[])  {
       // TODO
    }*/
}