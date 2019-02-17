const { DataFactory } = N3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

//let DATASET_URL = 'http://localhost:8081/rawdata/latest';
let DATASET_URL = 'https://lodi.ilabt.imec.be/observer/rawdata/latest';

let sg = 'https://opentrafficlights.org/id/signalgroup/K648/1';
let SPEED = 100;
let first = true;
let signalgroups = [];
let prevGatGreen = [];
let lastGat, iLastGat, nextLastGat;
let AMOUNT_OF_FRAGMENTS = 15;

let WIDTH, HEIGHT;
if (window.innerWidth > 600) WIDTH = 600;
else WIDTH = 2*window.innerWidth;

if (window.innerHeight > 240) HEIGHT = 240;
else HEIGHT = window.innerHeight;

document.getElementById('chart').style.width = WIDTH;

let vertreklanen = {};

let data = {};

function updateDataGraphic() {
    if (data[sg] && data[sg].length > 0) {
        MG.data_graphic({
            title: "Wachttijd tot een groen licht",
            description: "Aantal seconden tot licht op groen springt.",
            chart_type: 'point',
            //markers: [{'generatedAtTime': new Date("2019-01-28T17:09:00"), 'label': 'Nu'}],
            point_size: '1',
            data: data[sg],
            top: 70,
            width: WIDTH,
            height: HEIGHT,
            right: 40,
            target: '.chart',
            x_accessor: 'generatedAtTime',
            y_accessor: 'timeTillGreen',
            mouseover: function(d, i) {
                let format = d3.timeFormat("%Hu %Mm %Ss");
                d3.select('.chart svg .mg-active-datapoint')
                    .text(Math.round(d.data.timeTillGreen) + " seconden om " + format(d.data.generatedAtTime));
            },
            xax_format: function (d, i) {
                let format = d3.timeFormat("%H:%M:%S");
                return format(d);
            }
        });
    }
}

function setDataGraphicEmpty() {
    MG.data_graphic({
        title: "Wachttijd tot een groenlicht",
        description: "Aantal seconden tot licht op groen springt.",
        error: 'No data found.',
        chart_type: 'missing-data',
        top: 70,
        width: 600,
        height: 240,
        right: 40,
        target: '.chart',
        missing_text: 'No data found.'
    });
}

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
};


start();

async function start() {
    let doc = await download(DATASET_URL);
    let store = await parseAndStoreQuads(doc);
    signalgroups = await getSignalgroups(store);
    initConfiguration(store);

    // Init
    signalgroups.forEach((sg) => {
        prevGatGreen[sg] = null;
        data[sg] = [];
    });

    while(true) {
        await calcHistoricData(store);
        showLatest(store);

        let count = 0;

        // HISTORY
        let prev = store.getQuads(null, namedNode('http://www.w3.org/ns/hydra/core#previous'), null)[0];
        while (prev && count < AMOUNT_OF_FRAGMENTS) {
            count++;

            doc = await download(prev.object.value);
            store = await parseAndStoreQuads(doc);

            await calcHistoricData(store);

            prev = store.getQuads(null, namedNode('http://www.w3.org/ns/hydra/core#previous'), null)[0];
        }

        updateDataGraphic();

        doc = await download(DATASET_URL);
        store = await parseAndStoreQuads(doc);

        signalgroups.forEach((sg) => {
            prevGatGreen[sg] = null;
            data[sg] = [];
        });

        await sleep(SPEED)
    }
}

async function calcHistoricData(_store) {
    // Loop over observations order descending
    let observations = _store.getQuads(null, namedNode('http://www.w3.org/ns/prov#generatedAtTime'), null);
    observations.sort(function(a, b) {
        a = new Date(a.object.value).getTime();
        b = new Date(b.object.value).getTime();

        return a>b ? -1 : a<b ? 1 : 0;
    }).forEach((observation) => {
        let generatedAtTime = new Date(observation.object.value);

        if (!lastGat) lastGat = generatedAtTime;

        // Loop over all signalstates in the observation
        _store.getQuads(null, namedNode('https://w3id.org/opentrafficlights#signalState'), null, observation.subject).forEach((signalstateQuad) => {
            let signalgroup = signalstateQuad.subject.value;
            let signalphase = _store.getQuads(signalstateQuad.object, namedNode('https://w3id.org/opentrafficlights#signalPhase'), null, observation.subject)[0];
            let timeTillGreen;
            // When green
            if (signalphase.object.value === 'https://w3id.org/opentrafficlights/thesauri/signalphase/6') {
                prevGatGreen[signalgroup] = generatedAtTime;
                timeTillGreen = 0;
            }

            if (prevGatGreen[signalgroup] != null){
                timeTillGreen = (prevGatGreen[signalgroup].getTime() - generatedAtTime.getTime())/1000;

                // There's probably a data gap when this is very big
                if (timeTillGreen < 100) {
                    if (!data[signalgroup]) data[signalgroup] = [];

                    data[signalgroup].unshift({
                        'generatedAtTime': new Date(generatedAtTime),
                        'timeTillGreen': timeTillGreen
                    })
                }
            }
        });
    });
}

async function getSignalgroups(_store) {
    let signalgroups = [];
    await _store.getQuads(null, namedNode('http://www.w3.org/2000/01/rdf-schema#type'), namedNode('https://w3id.org/opentrafficlights#Signalgroup')).forEach( (quad) => {
        signalgroups.push(quad.subject.value);
    });
    return signalgroups;
}

function download(_url) {
    return new Promise(resolve => {
        fetch(_url)
            .then(function(response) {
                return response.text();
            })
            .then(function(text) {
                resolve(text);
            });
    });
}

function parseAndStoreQuads(_doc) {
    return new Promise(resolve => {
        const parser = new N3.Parser();
        const store = N3.Store();
        parser.parse(_doc, (error, quad, prefixes) => {
            if (quad)
                store.addQuad(quad);
            else
                return resolve(store);
        });
    })
}

function initConfiguration(_store) {
    // Set departure lanes
    let options = '';
    let processedDepartureLanes = [];
    _store.getQuads(null, namedNode('https://w3id.org/opentrafficlights#departureLane'), null).forEach((quad) => {
        _store.getQuads(quad.object, namedNode('http://purl.org/dc/terms/description'), null).forEach( (quad) => {
            if (!processedDepartureLanes.includes(quad.object.value)){
                processedDepartureLanes.push(quad.object.value);

                options +=
                    '<option value="' +
                    quad.subject.value +
                    '">' +
                    quad.object.value +
                    "</option>";
            }

            // Load arrival lanes
            _store.getQuads(null, namedNode('https://w3id.org/opentrafficlights#departureLane'), quad.subject).forEach((connectie) => {
                let signalgroup = _store.getQuads(connectie.subject, namedNode('https://w3id.org/opentrafficlights#signalGroup'), null)[0].object.value;
                _store.getQuads(connectie.subject, namedNode('https://w3id.org/opentrafficlights#arrivalLane'), null).forEach( (arrivalLane) => {
                    _store.getQuads(arrivalLane.object, namedNode('http://purl.org/dc/terms/description'), null).forEach( (descr) => {
                        if(!vertreklanen[quad.subject.value]) vertreklanen[quad.subject.value] = [];
                        vertreklanen[quad.subject.value][arrivalLane.object.value] = {
                            '@id': arrivalLane.object.value,
                            'http://purl.org/dc/terms/description': descr.object.value,
                            'https://w3id.org/opentrafficlights#signalGroup': signalgroup
                        };
                    });
                });
            });
        });
    });
    document.getElementById("vertreklaan").innerHTML = options;

    // Load arrival lanes dropdown list
    changeAankomstlanen();
}

$("#vertreklaan").on("change", function() {
    changeAankomstlanen();

    // Set active signalgroup for visualization
    checkActiveSignalgroup();
});

$("#aankomstlaan").on("change", function() {
    checkActiveSignalgroup();
});

function changeAankomstlanen() {
    let aankomstlanen = [];
    const vertreklaan = document.getElementById("vertreklaan").value;
    let options = '';
    for (let aankomstlaan in vertreklanen[vertreklaan]) {
        if (!aankomstlanen.includes(vertreklanen[vertreklaan][aankomstlaan]['http://purl.org/dc/terms/description'])) {
            options +=
                '<option value="' +
                vertreklanen[vertreklaan][aankomstlaan]['@id'] +
                '">' +
                vertreklanen[vertreklaan][aankomstlaan]['http://purl.org/dc/terms/description'] +
                "</option>";
            aankomstlanen.push(vertreklanen[vertreklaan][aankomstlaan]['http://purl.org/dc/terms/description']);
        }
    }

    document.getElementById("aankomstlaan").innerHTML = options;
}

function checkActiveSignalgroup() {
    const vertreklaan = document.getElementById("vertreklaan").value;
    const aankomstlaan = document.getElementById("aankomstlaan").value;
    if (vertreklanen[vertreklaan][aankomstlaan]['https://w3id.org/opentrafficlights#signalGroup']) {
        sg = vertreklanen[vertreklaan][aankomstlaan]['https://w3id.org/opentrafficlights#signalGroup'];
        updateDataGraphic();
    } else {
        setDataGraphicEmpty()
    }
}

async function showLatest(_store) {
    // Loop over observations order descending
    let observations = _store.getQuads(null, namedNode('http://www.w3.org/ns/prov#generatedAtTime'), null);
    let latest = observations.sort(function(a, b) {
        a = new Date(a.object.value).getTime();
        b = new Date(b.object.value).getTime();

        return a>b ? -1 : a<b ? 1 : 0;
    })[0];

    let generatedAtTime = latest.object.value;

    // Get state of active signalgroup
    let signalstate = _store.getQuads(namedNode(sg), namedNode('https://w3id.org/opentrafficlights#signalState'), null, latest.subject)[0];
    if (signalstate) {
        let minEndTime = _store.getQuads(signalstate.object, namedNode('https://w3id.org/opentrafficlights#minEndTime'), null, latest.subject)[0];
        let maxEndTime = _store.getQuads(signalstate.object, namedNode('https://w3id.org/opentrafficlights#maxEndTime'), null, latest.subject)[0];
        let signalPhase = _store.getQuads(signalstate.object, namedNode('https://w3id.org/opentrafficlights#signalPhase'), null, latest.subject)[0];

        let count = Math.round((new Date(minEndTime.object.value).getTime() - new Date(generatedAtTime).getTime())/1000);
        if (minEndTime.object.value === maxEndTime.object.value) {
            showCounterLabel(count, signalPhase.object.value);
        } else {
            showCounterLabel("> " + count, signalPhase.object.value);
        }
    }
}

function showCounterLabel(counter_, label_) {
    const info = '<h3>&nbsp;&nbsp;' + counter_ + " seconden</h3>";

    // const info = '<h3 style="float: left">' + label_ + '</h3><h1 style="font-size: 100px;">' + counter_ + '</h1></div>';
    if (label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/2' || label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/3') {
        // Red
        document.getElementById("orange_light").style.display = "none";
        document.getElementById("green_light").style.display = "none";
        document.getElementById("red_light").style.display = "flex";
    }
    else if (label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/5' || label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/6') {
        // green
        document.getElementById("red_light").style.display = "none";
        document.getElementById("orange_light").style.display = "none";
        document.getElementById("green_light").style.display = "flex";
    }
    else {
        // orange
        document.getElementById("red_light").style.display = "none";
        document.getElementById("green_light").style.display = "none";
        document.getElementById("orange_light").style.display = "flex";
    }

    document.getElementById('light_info').innerHTML = info;
}