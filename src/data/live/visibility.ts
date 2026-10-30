/** Archived projects remain in the database for action-log undo, but are not visible in live reads. */
export function visibleProjects<T extends {status: string}>(projects: readonly T[]): T[] {
 return projects.filter(project => project.status !== 'archived')
}

export function visibleProjectIds<T extends {id: string; status: string}>(projects: readonly T[]): Set<string> {
 return new Set(visibleProjects(projects).map(project => project.id))
}
