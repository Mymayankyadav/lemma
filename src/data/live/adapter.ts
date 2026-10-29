import type { LemmaApi } from '../api'
import { notImplemented } from '../api'

/** Live implementation belongs to DATA-1. */
export class LiveAdapter implements LemmaApi {
 readonly mode = 'live' as const
 async getAuth(..._args: Parameters<LemmaApi['getAuth']>): ReturnType<LemmaApi['getAuth']> { throw notImplemented('getAuth') }
 async signIn(..._args: Parameters<LemmaApi['signIn']>): ReturnType<LemmaApi['signIn']> { throw notImplemented('signIn') }
 async signOut(..._args: Parameters<LemmaApi['signOut']>): ReturnType<LemmaApi['signOut']> { throw notImplemented('signOut') }
 async bootstrap(..._args: Parameters<LemmaApi['bootstrap']>): ReturnType<LemmaApi['bootstrap']> { throw notImplemented('bootstrap') }
 async getSettings(..._args: Parameters<LemmaApi['getSettings']>): ReturnType<LemmaApi['getSettings']> { throw notImplemented('getSettings') }
 async updateSettings(..._args: Parameters<LemmaApi['updateSettings']>): ReturnType<LemmaApi['updateSettings']> { throw notImplemented('updateSettings') }
 async rotateConnectorSecret(..._args: Parameters<LemmaApi['rotateConnectorSecret']>): ReturnType<LemmaApi['rotateConnectorSecret']> { throw notImplemented('rotateConnectorSecret') }
 async listStyles(..._args: Parameters<LemmaApi['listStyles']>): ReturnType<LemmaApi['listStyles']> { throw notImplemented('listStyles') }
 async updateStyle(..._args: Parameters<LemmaApi['updateStyle']>): ReturnType<LemmaApi['updateStyle']> { throw notImplemented('updateStyle') }
 async getHome(..._args: Parameters<LemmaApi['getHome']>): ReturnType<LemmaApi['getHome']> { throw notImplemented('getHome') }
 async listSubjects(..._args: Parameters<LemmaApi['listSubjects']>): ReturnType<LemmaApi['listSubjects']> { throw notImplemented('listSubjects') }
 async createSubject(..._args: Parameters<LemmaApi['createSubject']>): ReturnType<LemmaApi['createSubject']> { throw notImplemented('createSubject') }
 async listProjects(..._args: Parameters<LemmaApi['listProjects']>): ReturnType<LemmaApi['listProjects']> { throw notImplemented('listProjects') }
 async getProject(..._args: Parameters<LemmaApi['getProject']>): ReturnType<LemmaApi['getProject']> { throw notImplemented('getProject') }
 async createProject(..._args: Parameters<LemmaApi['createProject']>): ReturnType<LemmaApi['createProject']> { throw notImplemented('createProject') }
 async updateProject(..._args: Parameters<LemmaApi['updateProject']>): ReturnType<LemmaApi['updateProject']> { throw notImplemented('updateProject') }
 async getCheckpoint(..._args: Parameters<LemmaApi['getCheckpoint']>): ReturnType<LemmaApi['getCheckpoint']> { throw notImplemented('getCheckpoint') }
 async addSource(..._args: Parameters<LemmaApi['addSource']>): ReturnType<LemmaApi['addSource']> { throw notImplemented('addSource') }
 async deleteSource(..._args: Parameters<LemmaApi['deleteSource']>): ReturnType<LemmaApi['deleteSource']> { throw notImplemented('deleteSource') }
 async listSessions(..._args: Parameters<LemmaApi['listSessions']>): ReturnType<LemmaApi['listSessions']> { throw notImplemented('listSessions') }
 async getSession(..._args: Parameters<LemmaApi['getSession']>): ReturnType<LemmaApi['getSession']> { throw notImplemented('getSession') }
 async listProposals(..._args: Parameters<LemmaApi['listProposals']>): ReturnType<LemmaApi['listProposals']> { throw notImplemented('listProposals') }
 async getProposal(..._args: Parameters<LemmaApi['getProposal']>): ReturnType<LemmaApi['getProposal']> { throw notImplemented('getProposal') }
 async approveProposal(..._args: Parameters<LemmaApi['approveProposal']>): ReturnType<LemmaApi['approveProposal']> { throw notImplemented('approveProposal') }
 async rejectProposal(..._args: Parameters<LemmaApi['rejectProposal']>): ReturnType<LemmaApi['rejectProposal']> { throw notImplemented('rejectProposal') }
 async approveAllCards(..._args: Parameters<LemmaApi['approveAllCards']>): ReturnType<LemmaApi['approveAllCards']> { throw notImplemented('approveAllCards') }
 async getDeckTree(..._args: Parameters<LemmaApi['getDeckTree']>): ReturnType<LemmaApi['getDeckTree']> { throw notImplemented('getDeckTree') }
 async getReviewItems(..._args: Parameters<LemmaApi['getReviewItems']>): ReturnType<LemmaApi['getReviewItems']> { throw notImplemented('getReviewItems') }
 async recordReview(..._args: Parameters<LemmaApi['recordReview']>): ReturnType<LemmaApi['recordReview']> { throw notImplemented('recordReview') }
 async undoReview(..._args: Parameters<LemmaApi['undoReview']>): ReturnType<LemmaApi['undoReview']> { throw notImplemented('undoReview') }
 async searchCards(..._args: Parameters<LemmaApi['searchCards']>): ReturnType<LemmaApi['searchCards']> { throw notImplemented('searchCards') }
 async getCard(..._args: Parameters<LemmaApi['getCard']>): ReturnType<LemmaApi['getCard']> { throw notImplemented('getCard') }
 async createNote(..._args: Parameters<LemmaApi['createNote']>): ReturnType<LemmaApi['createNote']> { throw notImplemented('createNote') }
 async updateNote(..._args: Parameters<LemmaApi['updateNote']>): ReturnType<LemmaApi['updateNote']> { throw notImplemented('updateNote') }
 async setNoteStatus(..._args: Parameters<LemmaApi['setNoteStatus']>): ReturnType<LemmaApi['setNoteStatus']> { throw notImplemented('setNoteStatus') }
 async addComment(..._args: Parameters<LemmaApi['addComment']>): ReturnType<LemmaApi['addComment']> { throw notImplemented('addComment') }
 async dismissComment(..._args: Parameters<LemmaApi['dismissComment']>): ReturnType<LemmaApi['dismissComment']> { throw notImplemented('dismissComment') }
 async resolveMisconception(..._args: Parameters<LemmaApi['resolveMisconception']>): ReturnType<LemmaApi['resolveMisconception']> { throw notImplemented('resolveMisconception') }
 async getAtlas(..._args: Parameters<LemmaApi['getAtlas']>): ReturnType<LemmaApi['getAtlas']> { throw notImplemented('getAtlas') }
 async pinConcept(..._args: Parameters<LemmaApi['pinConcept']>): ReturnType<LemmaApi['pinConcept']> { throw notImplemented('pinConcept') }
 async getReviewLog(..._args: Parameters<LemmaApi['getReviewLog']>): ReturnType<LemmaApi['getReviewLog']> { throw notImplemented('getReviewLog') }
 async getInsightData(..._args: Parameters<LemmaApi['getInsightData']>): ReturnType<LemmaApi['getInsightData']> { throw notImplemented('getInsightData') }
 async exportAll(..._args: Parameters<LemmaApi['exportAll']>): ReturnType<LemmaApi['exportAll']> { throw notImplemented('exportAll') }
}
