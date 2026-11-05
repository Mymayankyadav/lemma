import {Navigate} from 'react-router';
import {isFlagOn} from '../../flags';

export default function CalendarPage(){
 if(!isFlagOn('v6Shell')) return <Navigate to="/" replace/>;
 return <section aria-labelledby="calendar-title"><h1 id="calendar-title">Calendar</h1><p>Your planned and logged study will appear here.</p></section>;
}
