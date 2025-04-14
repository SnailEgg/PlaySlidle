/* 
    Project:    Slidle
    File:       script.js
    Author:     Jordan Smith
    Date:       Apr 12, 2025
*/
/*
    --- Required Concepts Index ---
    Below are line numbers on/after which one or more examples of each required concept can be found.

    Classes:                    Line 51
    Event Handling:             Line 892
    DOM Manipulation:           Line 456
    Data Management:            Unsure of intended meaning of this so perhaps Line 33 or Lines 505, 525
    Fetch:                      Lines 505, 525
    JSON:                       Lines 417, 514
    Objects / Arrays:           Lines 33, 859
    Destructuring:              Line 468
    Loops:                      Line 456
    Try/Catch/Finally:          Line 815
    Throwing Errors:            Line 815
    Conditionals:               Line 305
    Selectors:                  Line 767
    Anonymous Functions:        Line 567
    Scope:                      Lines 453-485
    Template/String Literals:   Line 598
    Regex/Data Validation:      Line 815
    jQuery:                     Line 598
    Async/Await/Promises:       Line 505
*/

// global object for holding game and level data
const data = {
    activeDragger: null, // currently selected dragger for tap-to-move controls
    curLevel: 0, // index of the current level
    levels: null, // array of game levels
    totalLevels: 0, // total levels in the game (is determined when levels are first fetched and is not updated again)
    nextLevelTimer: null, // stores the ID of active timeout for level transition
    moves: 0, // move count for current level
    moveCounts: [], // move counts for all levels beaten this game
    levelTimes: [], // times to beat all levels so far this game
    levelStartTime: 0, // time (in milliseconds) when the current level was started
    movesChart: null, // move counts chart
    timesChart: null, // level times chart
    tempElements: [], // elements that should be deleted the next time the game is started
    inGame: false, // indicates whether game is currently running
    prevCheats: [], // previously used cheat codes that can not be used again
    cheatFeedbackTimer: null
};

//#region Classes

// class for some functionality on draggers
class Dragger {
    element; // the jQuery element associated with this instance
    color; // the color of this tile

    constructor(color, startingDropper) {
        this.color = color;

        // create a dragger and keep track of it
        this.element = this.initiateDragger($("<div>").addClass(`dragger ${color}`).appendTo($("#root")));

        // store a reference to this object in the corresponding jQuery element
        this.element.data("object", this);

        // place this dragger element in its starting dropper
        startingDropper.trigger("gaindragger", [this.element]);
    }

    // check if this dragger can currently be dropped on a given dropper
    canDropOn(dropper) {
        // only magenta tiles can drop on spaces with tiles in them
        if (this.color !== "magenta" && dropper.data("containedDragger")) return false;

        // cyan tiles can't be dropped anywhere
        if (this.color === "cyan") return false;

        // yellow tiles can move one space in any direction
        if (this.color === "yellow") return Math.abs(dropper.data("object").y - this.element.data("containingDropper").data("object").y) <= 1 && Math.abs(dropper.data("object").x - this.element.data("containingDropper").data("object").x) <= 1;
        
        // magenta tiles can only move to spaces that already have tiles on them
        if (this.color === "magenta") return dropper.data("containedDragger") && dropper.data("containedDragger")[0] !== this.element[0];
    }

    // highlight all droppers this dragger could currently drop on
    highlightAvailableDroppers() {
        Dragger.unhighlightDroppers();

        let droppers = $(".dropper");

        droppers.each((index, dropper) => {
            if (this.canDropOn($(dropper))) {
                $(dropper).addClass("highlighted");
            }
        });
    }

    // static method to unhighlight all droppers
    static unhighlightDroppers() {
        let droppers = $(".dropper");

        droppers.each((index, dropper) => {
            $(dropper).removeClass("highlighted targeted");
        });
    }

    // static method to check if the level has been beaten
    // move to next level if it has
    static checkWin() {
        let victory = true;

        $(".dropper.goal-space").each((index, dropper) => {
            if (!$(dropper).data("containedDragger") || !($(dropper).data("containedDragger").data("object").color === $(dropper).data("object").targetColor)) {
                victory = false;
            }
        });

        if (victory) {
            Dragger.queueNextLevel();
        }
    }

    // static method to start a timer to move to the next level
    static queueNextLevel() {
        // make sure the next level isn't already queued
        if (data.nextLevelTimer === null) {
            let curTime = Date.now(); // the time this level was beaten

            // record move count for this level
            data.moveCounts[data.curLevel] = data.moves;
            // calculate and record time to beat this level
            data.levelTimes[data.curLevel] = Math.floor((curTime - data.levelStartTime)/100)/10;

            // destroy draggable functionality so that draggers can't be dragged around after level is beaten
            $(".dragger").draggable("destroy");

            // set timer to start next level
            data.nextLevelTimer = setTimeout(() => {
                data.nextLevelTimer = null;
                fetchLayout(true);
            }, 800);
        }
    }

    // set up dragger element with jQuery UI draggable functionality
    // add all needed event listeners
    initiateDragger(dragger) {
        dragger.draggable({
            stack: ".dragger", // keep held dragger on top
            // dragging starts
            start: (event) => {
                // deactivate active dragger
                if (data.activeDragger) {
                    data.activeDragger.removeClass("active");
                    data.activeDragger = null;
                }

                $(event.target).data("object").highlightAvailableDroppers();

                // remember starting position if drag started from rest
                if(!$(event.target).data("flying")) {
                    $(event.target).data("last-top", $(event.target).css("top"));
                    $(event.target).data("last-left", $(event.target).css("left"));
                } 
            },
            // dragger is released
            stop: (event) => {
                Dragger.unhighlightDroppers();
                $(event.target).trigger("drop");
            }
        })
        .on("droppermove", (event) => {
            // don't continue if dragger has no containing dropper
            if (!$(event.target).data("containingDropper")) return;
            let dropper = $(event.target).data("containingDropper")[0]; // this dragger's containing dropper
            // calculate necessary offset from dropper's top-left corner to centre the dragger
            let cornerOffsetX = (dropper.offsetWidth - event.target.offsetWidth) / 2;
            let cornerOffsetY = (dropper.offsetHeight - event.target.offsetHeight) / 2;
            // set dragger position
            $(event.target).data("last-top", dropper.offsetTop + cornerOffsetY);
            $(event.target).data("last-left", dropper.offsetLeft + cornerOffsetX);
        })
        .on("drop", (event) => {
            Dragger.checkWin();

            $(event.target).data("flying", true); // indicate dragger is not at rest
            // animate dropper toward target position
            $(event.target).animate({
                top: $(event.target).data("last-top"),
                left: $(event.target).data("last-left")
            }, 200, () => {
                $(event.target).data("flying", false); // dragger is at rest
            });
        })
        .on("displace", (event) => {
            // send dropper immediately to target position
            $(event.target).css({
                top: $(event.target).data("last-top"),
                left: $(event.target).data("last-left")
            });
        })
        .on("click", (event) => {
            // don't pay attention to clicks if the level is finished
            if (data.nextLevelTimer) return;

            // prevent body from acting on click event, which would immediately deactivate the clicked dragger
            event.stopPropagation();

            let setNewActive = true;

            // if there is already an active dragger
            if (data.activeDragger) {
                data.activeDragger.removeClass("active");
                // if current active dragger and clicked dragger both have containing droppers
                if ($(event.target).data("containingDropper") && data.activeDragger.data("containingDropper")) {
                    if (data.activeDragger.data("object").canDropOn($(event.target).data("containingDropper"))) {
                        setNewActive = false;
                    }

                    // trigger click on clicked dragger's dropper to initiate a swap
                    $(event.target).data("containingDropper").trigger("click");
                }
            }
            
            Dragger.unhighlightDroppers();

            // set active dragger to clicked dragger
            if (setNewActive) {
                data.activeDragger = $(event.target);
                $(event.target).addClass("active");
                $(event.target).data("object").highlightAvailableDroppers();
            }
        })
        .on("mouseover", (event) => {
            // pass mouseover event along to dragger's containing dropper
            if ($(event.target).data("containingDropper")) {
                $(event.target).data("containingDropper").trigger("mouseover");
            }
        })
        .on("mouseout", (event) => {
            // pass mouseout event along to dragger's containing dropper
            if ($(event.target).data("containingDropper")) {
                $(event.target).data("containingDropper").trigger("mouseout");
            }
        });

        return dragger;
    }
}

// class for some functionality on droppers
class Dropper {
    x; // dropper's x coordinate in the grid
    y; // y coordinate
    targetColor; // color of dragger that must be dropped in this dropper to win the level
    element; // the jQuery element associated with this instance

    constructor(targetColor, x, y) {
        this.x = x;
        this.y = y;
        this.targetColor = targetColor;

        // create a dropper element and keep track of it
        this.element = this.initiateDropper($("<div>").addClass("dropper dropper-size"));

        // store a reference to this object in the corresponding jQuery element
        this.element.data("object", this);

        // if there is a target colour, display the correct border on this dropper
        if(targetColor !== "") {
            this.element.addClass(targetColor);
            this.element.addClass("goal-space");
        }

    }

    // set up dropper element with jQuery UI droppable functionality
    // add all needed event listeners
    initiateDropper(dropper) {
        dropper.droppable({
            // a dragger is dropped on this dropper
            drop: (event, ui) => {
                let dragger = ui.draggable;

                if (dragger.data("object").canDropOn($(event.target))) {
                    $(event.target).trigger("gaindragger", [dragger]);
                }
            },
            
            // a dragger's centre enters this dropper
            over: (event, ui) => {
                $(event.target).trigger("target", [ui.draggable]);
            },
            
            // a dragger's centre exits this dropper
            out: (event) => {
                $(event.target).trigger("untarget");
            }
        })
        .on("gaindragger", (event, dragger, otherLose = true) => {
            if (!dragger) return;
            let containedDragger = $(event.target).data("containedDragger"); // dragger currently held by this dropper
            // if this dropper is empty, accept the dragger
            if (!$(event.target).data("occupied")) {
                data.moves++;

                $(event.target).data("occupied", true);
                $(event.target).trigger("untarget");
                // mark incoming dragger as contained in this dropper
                $(event.target).data("containedDragger", dragger);
                // mark incoming dragger's current container as empty
                if (otherLose && dragger.data("containingDropper")) {
                    dragger.data("containingDropper").trigger("losedragger");
                }
                // mark this dropper as incoming dragger's container
                dragger.data("containingDropper", $(event.target));

                // tell incoming dragger its containing dropper has moved
                dragger.trigger("droppermove");

            // otherwise, if dragger is coming from a different dropper, swap the draggers' positions
            } else if (dragger.data("containingDropper") && dragger.data("containingDropper")[0] !== event.target) {
                // when draggers are swapped, move count is double counted; correct this
                data.moves--;

                let otherDropper = dragger.data("containingDropper"); // incoming dragger's containing dropper
                
                // send currently contained dragger to the incoming dragger's current dropper
                containedDragger.data("containingDropper", otherDropper).trigger("droppermove").trigger("drop");
                otherDropper.data("occupied", false).trigger("gaindragger", [containedDragger, false]);
                // mark this dropper as unoccupied and now accept the incoming dragger
                $(event.target).data("occupied", false).trigger("gaindragger", [dragger, false]);
            }

            if ($(event.target).data("object").targetColor !== "" && $(event.target).data("containedDragger").data("object").color === $(event.target).data("object").targetColor) {
                $(event.target).addClass("satisfied");
            } else {
                $(event.target).removeClass("satisfied");
            }

            $("#move_counter").text(data.moves);
        })
        .on("losedragger", (event) => {
            // reset dropper and mark it as unoccupied
            $(event.target).removeClass("satisfied");
            $(event.target).data("occupied", false);
            $(event.target).css("border", "");
            $(event.target).data("containedDragger", null);
        })
        .on("target", (event, selectedDragger) => {
            // don't highlight this dropper if the selected dragger is already in this dropper
            if ($(event.target).data("containedDragger") && selectedDragger[0] === $(event.target).data("containedDragger")[0]) return;
            // don't highlight this dropper if it's occupied and selected dragger isn't contained in a dropper
            if (!selectedDragger.data("containingDropper") && $(event.target).data("occupied")) return;
        
            if (!selectedDragger.data("object").canDropOn($(event.target))) return;
        
            // highlight this dropper
            $(event.target).addClass("targeted");
        })
        .on("untarget", (event) => {
            // unhighlight this dropper
            $(event.target).removeClass("targeted")
        })
        .on("click", (event) => {
            // if there is an active dragger, accept it and reset the active dragger
            if (data.activeDragger) {
                data.activeDragger.removeClass("active")

                if (data.activeDragger.data("object").canDropOn($(event.target))) {
                    $(event.target).trigger("gaindragger", [data.activeDragger]);
                    data.activeDragger.trigger("drop");
                } else if ($(event.target).data("containedDragger")) {
                    data.activeDragger = null;
                    $(event.target).data("containedDragger").trigger("click");
                } else {
                    data.activeDragger = null;
                    $(event.target).trigger("untarget");
                    Dragger.unhighlightDroppers();
                }
            }
        })
        .on("mouseover", (event) => {
            // target this dropper if there is an active dragger
            if (data.activeDragger) {
                $(event.target).trigger("target", [data.activeDragger]);
            }
        })
        .on("mouseout", (event) => {
            // untarget this dropper if there is an active dragger
            //      we check for an active dragger to make sure this isn't
            //      happening while dragging a dragger, in that case targeting
            //      is handled by the built-in droppable over and out events.
            if (data.activeDragger) {
                $(event.target).trigger("untarget");
            }
        });

        return dropper;
    }
}

//#endregion

//#region Networking Functions

// fetches all level data if it hasn't already been fetched
// incrementLevel determines whether to move to the next level
// sets up level layout
// displays results screen instead if level index exceeds total levels
const fetchLayout = async (incrementLevel = false) => {
    // attempt to fetch level data if it isn't already saved
    if (!data.levels) {
        try {
            // fetch and locally save level layouts
            data.levels = await fetch("https://jordan.json.compsci.cc/levels", { signal: AbortSignal.timeout(1000) }).then(response => response.json());
            // keep track of total number of levels
            data.totalLevels = data.levels.length;
        } catch (error) {
            // display error message
            $("#root").html(`<h2>Oops! Couldn't load level layouts.</h2><p>Are you connected to the VPN?</p><p>Error: ${error.message}`);
            // fetch was unsuccessful, so ensure data.levels is null so the fetch can be reattempted later
            data.levels = null;
            
            // return false to indicate level could not be loaded
            return false;
        }
    }

    // display game interface
    showGame();
    
    // reset any previous level layout
    $("#root").html("");

    // go to the next level if needed
    if (incrementLevel) {
        data.curLevel++;
    }

    // display results screen if we've surpassed the last level
    if (data.curLevel >= data.totalLevels) {
        data.inGame = false;
        displayResults();
    // otherwise, set up the level layout
    } else {
        // update displayed level number
        $("#level_header").text(`Level ${data.curLevel + 1}`);
        // show Restart Level button
        $("#btn_restart").show();

        let thisLevel = data.levels[data.curLevel];
        
        // loop through each index in 2D level data array
        for (x in thisLevel) {
            let row = $("<div>").addClass("game-row").appendTo($("#root"));

            for (y in thisLevel[x]) {
                // add a space in this row
                let space = $("<div>").addClass("col space").appendTo(row);

                let spaceFiller; // will be equal to whatever is filling this space (dropper or placeholder)

                // if there is something in this space, create dropper, and possibly a dragger
                if (thisLevel[x][y]) {
                    // destructure the dragger that will fill this space now and the target color for this space
                    let [fillDragger, targetDragger] = thisLevel[x][y];

                    // set this space to be filled by a dropper
                    spaceFiller = new Dropper(targetDragger, x, y).element;

                    // if there is to be a dragger here, create it contained by this space's dropper
                    if (fillDragger !== "") {
                        new Dragger(fillDragger, spaceFiller);
                    }
                // otherwise, set this space to be filled by a placeholder
                } else {
                    spaceFiller = $("<div>").addClass("dropper-size");
                }

                // fill the space
                space.append(spaceFiller);
            }
        }

        // droppers move as level is filled out. Update dragger positions to where they should be now
        fixDraggerPositions();

        // reset the active dragger in case there was one when the previous level ended
        data.activeDragger = null;

        // reset move counter
        data.moves = 0;
        $("#move_counter").text(data.moves);

        // reset level timer
        data.levelStartTime = Date.now();
    }

    // return true to indicate level was successfully loaded
    return true;
}

const sendScores = async () => {
    // try to send this game's scores to the server
    // return error message on failure
    try {
        const response = await fetch("https://jordan.json.compsci.cc/scores", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ times: data.levelTimes, moves: data.moveCounts }),
            signal: AbortSignal.timeout(1000)
        });
    } catch (error) {
        return error.message;
    }

    // sending succeeded, return true
    return true;
}

const fetchScores = async () => {
    let scores = null; // recorded scores from all games played

    // try to fetch previous scores
    // return an error message on failure
    try {
        scores = await fetch("https://jordan.json.compsci.cc/scores", { signal: AbortSignal.timeout(1000) })
        .then(response => response.json());
    } catch (error) {
        return error.message;
    }

    // fetch succeeded, return object indicating it succeeded along with the fetched scores
    return {succeeded: true, scores: scores};
}

//#endregion

//#region Helper Functions

const getAverageScores = (scores) => {
    let moveTotals = []; // running total of all moves used across all games for each level
    let timeTotals = []; // running total of all time taken across all games for each level
    let scoreCount = 0; // running count of all recorded sets of scores

    // loop through each set of scores
    for (let i = 0; i < scores.length; i++) {
        scoreCount++

        // loop through each level
        for (let level = 0; level < data.totalLevels; level++) {
            // if no move count/time has been recorded yet for this level, set the running total to 0
            moveTotals[level] = moveTotals[level] === undefined ? 0 : moveTotals[level];
            timeTotals[level] = timeTotals[level] === undefined ? 0 : timeTotals[level];

            // add these scores to the totals
            moveTotals[level] += scores[i].moves[level];
            timeTotals[level] += scores[i].times[level];
        }
    }

    // calculate average move counts and times for each level
    let moveAverages = moveTotals.map(total => total / scoreCount);
    let timeAverages = timeTotals.map(total => total / scoreCount);

    return { moves: moveAverages, times: timeAverages };
}

const getBestScores = (scores) => {
    let bestMoveCounts = []; // lowest number of moves achieved for each level
    let bestTimes = []; // fastest time achieved for each level

    // loop through each set of scores
    for (let i = 0; i < scores.length; i++) {
        // loop through each level
        for (let level = 0; level < data.totalLevels; level++) {
            // update best move count if this is the first one for this level or the best one seen so far
            if (bestMoveCounts[level] === undefined || scores[i].moves[level] < bestMoveCounts[level]) {
                bestMoveCounts[level] = scores[i].moves[level];
            }

            // update best time if this is the first one for this level or the best one seen so far
            if (bestTimes[level] === undefined || scores[i].times[level] < bestTimes[level]) {
                bestTimes[level] = scores[i].times[level];
            }
        }
    }

    return { moves: bestMoveCounts, times: bestTimes };
}

const createAlert = (heading, body, alertType, containingElement) => {
    // create bootstrap alert
    let alert = $("<div>").addClass(`alert alert-${alertType}`)
                .append($("<p>").addClass("fw-bold").text(heading))
                .append($("<p>").text(body));

    // add alert as first element of the containing element
    containingElement.prepend(alert);

    // fade alert in
    alert.hide();
    alert.fadeIn();

    // mark element as temporary (to be removed the next time the game is started)
    data.tempElements.push(alert);
}

const updateLevelTimer = () => {
    let levelTime = (Math.floor((Date.now() - data.levelStartTime) / 100)/10).toFixed(1);
    $("#level_timer").text(`${levelTime}s`);
}

//#endregion

//#region Display Functions

// set up and display results screen
const displayResults = async () => {
    // hide/show elements to set up results screen
    $("#game_box > *").not("#level_info, #grid_background").hide();
    $("#btn_restart").hide();
    $("#result_charts").show();

    // show "Results" instead of level number
    $("#level_header").text(`Results`);

    // destroy any charts that currently exist so that new ones can be created
    if (data.movesChart !== null) {
        data.movesChart.destroy();
    }
    if (data.timesChart !== null) {
        data.timesChart.destroy();
    }

    // try to send scores to server
    const sendingResult = await sendScores();
    // if sending failed, alert the user
    if (sendingResult !== true) {
        createAlert("Couldn't save your scores. Are you connected to the VPN?", `Error: ${sendingResult}`, "warning", $("#result_charts"));
    }

    // set up dataset arrays with this game's scores
    let moveDatasets = [{
        label: "You", 
        data: data.moveCounts,
        borderColor: "#ddcf03",
        backgroundColor: "#fdfb58"
    }];
    let timeDatasets = [{
        label: "You", 
        data: data.levelTimes,
        borderColor: "#ddcf03",
        backgroundColor: "#fdfb58"
    }];

    // try to fetch previous scores from server
    let pastScoresRequest = await fetchScores();

    // if scores were successfully fetched, add average and best score datasets for moves and time
    if (pastScoresRequest.succeeded) {
        let pastScores = pastScoresRequest.scores; // all past scores
        let avgScores = getAverageScores(pastScores); // average scores for all levels
        let bestScores = getBestScores(pastScores); // best scores for all levels

        // add average and best move count datasets
        moveDatasets.push({
            label: 'Average',
            data: avgScores.moves,
            borderColor: "#006b8f",
            backgroundColor: "#28a3cc"
        });
        moveDatasets.push({
            label: 'Best',
            data: bestScores.moves,
            borderColor: "#d31d69",
            backgroundColor: "#e46298"
        });

        // add average and best time datasets
        timeDatasets.push({
            label: 'Average',
            data: avgScores.times,
            borderColor: "#006b8f",
            backgroundColor: "#28a3cc"
        });
        timeDatasets.push({
            label: 'Best',
            data: bestScores.times,
            borderColor: "#d31d69",
            backgroundColor: "#e46298"
        });
    // otherwise, alert user that scores couldn't be fetched
    } else {
        createAlert("Couldn't load previous scores. Are you connected to the VPN?", `Error: ${pastScoresRequest}`, "warning", $("#result_charts"));
    }

    // create array of strings like "Level #" for each level to be used as labels on charts
    let levelLabels = [];
    for (let i = 0; i < data.totalLevels; i++) {
        levelLabels.push(`Level ${i+1}`);
    }

    // find canvas for move count chart
    let movesChartCanvas = document.getElementById("chart_moves");
    //find canvas for level time chart
    let timesChartCanvas = document.getElementById("chart_times");

    // create chart of this game's move counts compared to all time average and best move counts
    data.movesChart = new Chart(movesChartCanvas, {
        type: 'line',
        color: "#f2f2f2",
        data: {
            labels: levelLabels,
            datasets: moveDatasets
        },
        options: {
            color: "#f2f2f2",
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#f2f2f2"
                    },
                },
                x: {
                    ticks: {
                        color: "#f2f2f2"
                    },
                }
            }
        }
    });

    // create chart of this game's level times compared to all time average and best times
    data.timesChart = new Chart(timesChartCanvas, {
        type: 'line',
        data: {
            labels: levelLabels,
            datasets: timeDatasets
        },
        options: {
            color: "#f2f2f2",
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#f2f2f2"
                    },
                },
                x: {
                    ticks: {
                        color: "#f2f2f2"
                    },
                }
            }
        }
    });
}

// display elements for gameplay
const showGame = () => {
    $("#game_box > *").not("#menu").show();
    $("#result_charts").hide();
}

//#endregion

//#region Gameplay Functions

// recalculates draggers' proper positions on their droppers
// moves them where they should be
const fixDraggerPositions = () => {
    $(".dragger").trigger("droppermove").trigger("displace");
}

// starts game at level 0
// resets game data
// cancels any pending level change
const startGame = async () => {
    // reset game data
    data.curLevel = 0;
    data.moveCounts = [];
    data.levelTimes = [];
    data.inGame = true;

    for (element of data.tempElements) {
        element.remove();
    }
    data.tempElements = [];

    // cancel pending level change
    if (data.nextLevelTimer !== null) {
        clearTimeout(data.nextLevelTimer);
        data.nextLevelTimer = null;
    }

    // hide the start menu
    $("#menu").hide();

    // set up the level
    if (! await fetchLayout()) {
        // show certain menu elements if fetching the level data failed
        $("#grid_background, #level_info").show();
        $("#result_charts").hide();

    }
}

// skip the current level if the user enters a valid postal code that they haven't entered before
const cheatLevel = (input) => {
    const pattern = /^[abceghjklmnprstvxy]\d[abceghjklmnprstvwxyz]\s?\d[abceghjklmnprstvwxyz]\d$/i; // postal code validation pattern

    cheatInput = document.getElementById("input_cheat"); //input field on which to put tooltips and valid/invalid classes

    // get rid of any previous tooltip on this input field
    let prevTooltip = bootstrap.Tooltip.getInstance(cheatInput);
    if (prevTooltip) {
        prevTooltip.dispose();
    }

    // clear any previous timeout for removing classes from input field
    clearTimeout(data.cheatFeedbackTimer);
    data.cheatFeedbackTimer = null;

    try {
        // validate input
        if(!data.inGame) {
            throw new Error("Must be in game.")
        }

        if(data.nextLevelTimer) {
            throw new Error("Must not be between levels.")
        }

        if (typeof input !== "string") {
            throw new Error("Input must be a string.");
        }

        if (input === "") {
            throw new Error("Input must not be empty.");
        }

        if (!pattern.test(input)) {
            throw new Error("Input must be a valid postal code.");
        }

        if (data.prevCheats.includes(input)) {
            throw new Error("Cheat codes can not be reused.");
        }

        // input is a valid cheat code
        cheatInput.classList.remove("is-invalid");
        cheatInput.classList.add("is-valid");

        // record this code so it can't be used again
        data.prevCheats.push(input);

        // cheaters get no rewards
        data.moves = Math.max(50, data.moves);
        data.levelStartTime = Math.min(Date.now() - 60000, data.levelStartTime);

        // show the cheater the rotten fruits of their deeds
        $("#move_counter").text(data.moves);
        updateLevelTimer();

        // go to the next level
        Dragger.queueNextLevel();
    } catch (error) {
        // cheat code is invalid or it's not the right time
        cheatInput.classList.remove("is-valid")
        cheatInput.classList.add("is-invalid");

        // create tooltip to inform the user of the issue
        new bootstrap.Tooltip(cheatInput, {
            title: error.message
        });
    } finally {
        // set timeout to remove visual feedback classes from the input field after some time
        data.cheatFeedbackTimer = setTimeout(() => {
            cheatInput.classList.remove("is-valid", "is-invalid");
        }, 3000);
    }
}

//#endregion

//#region Events

// window events
$(window).on("load", () => {
    $("#game_box > *").not("#menu").hide();

    // set up game timer updater
    setInterval(() => {
        // only update on-screen timer if a level transition is not pending
        if (data.nextLevelTimer === null) {
            updateLevelTimer();
        }
    }, 1);
})
.on("resize", fixDraggerPositions)
.on("click", () => {
    // reset the active dragger when clicking the page
    if (data.activeDragger) {
        data.activeDragger.removeClass("active");
        data.activeDragger = null;
        Dragger.unhighlightDroppers();
    }
});

// secret revealing
$("#container_secret").on("mouseover click", (event) => {
    $(event.target).addClass("secret-revealed");
});

// cheat code submission
$("#form_secret").on("submit", (event) => {
    event.preventDefault();

    console.log("form submitted");

    cheatLevel($("#input_cheat").val());
});

// set up buttons
$("#btn_game_start, #btn_game_restart").on("click", startGame);

$("#btn_restart").on("click", () => {
    // only restart the level if not waiting to move to next
    if (data.nextLevelTimer === null) {
        fetchLayout();        
    }
});

//#endregion