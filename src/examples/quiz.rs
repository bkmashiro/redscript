// Quiz game with trigger-based answers.
// Use /trigger quiz_start to begin, then /trigger quiz_a, /trigger quiz_b, or /trigger quiz_c.

@on_trigger("quiz_start")
fn start_quiz() {
    scoreboard_set(@s, "quiz_score", 0);
    scoreboard_set(@s, "quiz_question", 1);
    ask_question();
}

fn ask_question() {
    let question: int = scoreboard_get(@s, "quiz_question");

    if (question == 1) {
        tell(@s, "Question 1: Which block drops diamonds?");
        tell(@s, "A) Diamond ore  B) Stone  C) Oak log");
    } else {
        if (question == 2) {
            tell(@s, "Question 2: Which food restores more hunger?");
            tell(@s, "A) Bread  B) Steak  C) Beetroot");
        } else {
            if (question == 3) {
                tell(@s, "Question 3: Which mob explodes?");
                tell(@s, "A) Cow  B) Creeper  C) Villager");
            } else {
                finish_quiz();
            }
        }
    }
}

fn handle_answer(choice: int) {
    let question: int = scoreboard_get(@s, "quiz_question");
    let score: int = scoreboard_get(@s, "quiz_score");

    if (question == 1) {
        if (choice == 1) {
            score = score + 1;
            tell(@s, "Correct.");
        } else {
            tell(@s, "Wrong. The answer was A.");
        }
    } else {
        if (question == 2) {
            if (choice == 2) {
                score = score + 1;
                tell(@s, "Correct.");
            } else {
                tell(@s, "Wrong. The answer was B.");
            }
        } else {
            if (question == 3) {
                if (choice == 2) {
                    score = score + 1;
                    tell(@s, "Correct.");
                } else {
                    tell(@s, "Wrong. The answer was B.");
                }
            }
        }
    }

    scoreboard_set(@s, "quiz_score", score);
    question = question + 1;
    scoreboard_set(@s, "quiz_question", question);
    ask_question();
}

fn finish_quiz() {
    let score: int = scoreboard_get(@s, "quiz_score");
    title(@s, "Quiz Complete");
    tell(@s, "Your final quiz score is recorded in quiz_score.");
    scoreboard_set(@s, "quiz_question", 0);
    scoreboard_set(@s, "quiz_score", score);
}

@on_trigger("quiz_a")
fn answer_a() {
    handle_answer(1);
}

@on_trigger("quiz_b")
fn answer_b() {
    handle_answer(2);
}

@on_trigger("quiz_c")
fn answer_c() {
    handle_answer(3);
}
