import * as selectors from '../../selectors'
import { ASSIGNMENTS } from '../../constants'
import planningUtils from '../../utils/planning'
import { get, cloneDeep, has, pick } from 'lodash'

/**
 * Action Dispatcher for query the api for events
 * @return arrow function
 */
const query = ({
    searchQuery,
    orderByField,
    orderDirection,
    page=1,
    deskId=null,
    userId=null,
    state=null,
    type=null,
}) => (
    (dispatch, getState, { api }) => {

        const filterByValues = {
            Created: '_created',
            Updated: '_updated',
        }

        let query = {}
        let must = []
        let sort = '[("' + (get(filterByValues, orderByField, '_updated')) + '", '
            + (orderDirection === 'Asc' ? 1 : -1) + ')]'

        if (deskId) {
            must.push(
                { term: { 'assigned_to.desk': deskId } }
            )
        }

        if (userId) {
            must.push(
                { term: { 'assigned_to.user': userId } }
            )
        }

        if (state) {
            must.push(
                { term: { 'assigned_to.state': state } }
            )
        }

        if (type) {
            must.push(
                { term: { 'planning.g2_content_type': type } }
            )
        }

        if (searchQuery) {
            must.push({ query_string: { query: searchQuery } })
        }

        query.bool = { must }

        return api('assignments').query({
            page: page,
            sort: sort,
            source: JSON.stringify({ query }),
        })
        .then((data) => {
            if (get(data, '_items')) {
                data._items.forEach(planningUtils.convertGenreToObject)
                return Promise.resolve(data)
            } else {
                return Promise.reject('Failed to retrieve items')
            }
        }, (error) => (Promise.reject(error)))
    }
)

/**
 * Action Dispatcher that fetches a Assignment Item by ID
 * and adds or updates it in the redux store.
 * If the Assignment item already exists in the local store, then don't
 * fetch the Assignment item from the API
 * @param {string} id - The ID of the Assignment item to fetch
 * @param {boolean} force - Force using the API instead of local store
 * @return Promise
 */
const fetchAssignmentById = (id, force=false) => (
    (dispatch, getState, { api }) => {
        // Test if the Assignment item is already loaded into the store
        // If so, return that instance instead
        const storedAssignments = selectors.getStoredAssignments(getState())
        if (has(storedAssignments, id) && !force) {
            return Promise.resolve(storedAssignments[id])
        }

        return api('assignments').getById(id)
        .then((item) => {
            dispatch(self.receivedAssignments([item]))
            return Promise.resolve(item)
        }, (error) => Promise.reject(error))
    }
)

/**
 * Action to receive the list of Assignments and store them in the store
 * @param {Array} assignments - An array of Assignment items
 * @return object
 */
const receivedAssignments = (assignments) => ({
    type: ASSIGNMENTS.ACTIONS.RECEIVED_ASSIGNMENTS,
    payload: assignments,
})

/**
 * Action to save assignment
 * @param {Object} item - assignment to save
 * @param {Object} original - original assignment
 * @return object
 */
const save = (item, original=undefined) => (
    (dispatch, getState, { api }) => (
        // Find the original (if it exists) either from the store or the API
        new Promise((resolve, reject) => {
            if (original !== undefined) {
                return resolve(original)
            } else if (get(item, '_id')) {
                return dispatch(self.fetchAssignmentById(item._id))
                .then(
                    (item) => (resolve(item)),
                    (error) => (reject(error))
                )
            } else {
                return resolve({})
            }
        })
        .then((originalItem) => {
            // only assignment_to field.
            item = pick(item, 'assigned_to')
            item.assigned_to = pick(item.assigned_to, ['desk', 'user', 'coverage_provider'])

            return api('assignments').save(cloneDeep(originalItem), item)
            .then((item) => {
                    planningUtils.convertGenreToObject(item)
                    dispatch(self.receivedAssignments([item]))
                    return Promise.resolve(item)
                }, (error) => (Promise.reject(error))
            )
        }, (error) => (Promise.reject(error)))
    )
)

/**
 * Action to link assignment with news item
 * @param {String} assignmentId - Id of the Assignment
 * @param {String} newsItemId - Id of the news item
 * @return Promise
 */
const link = (assignmentId, newsItemId) => (
    (dispatch, getState, { api }) => (
        api('assignments_link').save({}, {
            assignment_id: assignmentId,
            item_id: newsItemId,
        })
    )
)

/**
 * Action to complete an assignment
 * @param {String} item - Assignment to be completed
 * @return Promise
 */
const complete = (item) => (
    (dispatch, getState, { api }) => (
        api.update(
            'assignments_complete',
            item,
            {}
        )
    )
)

const self = {
    query,
    receivedAssignments,
    fetchAssignmentById,
    save,
    link,
    complete,
}

export default self